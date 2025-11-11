import pandas as pd
import json
import sys
import os
from typing import Optional, Tuple, Dict, Any, List

def detect_coordinate_columns(df):
    """自动检测经纬度和值列"""
    col_lower = {col.lower(): col for col in df.columns}
    
    lon_col = None
    lat_col = None
    value_col = None
    
    # 常见经纬度列名
    lon_names = ['longitude', 'lon', 'lng', 'x', 'long']
    lat_names = ['latitude', 'lat', 'y']
    value_names = ['value', 'val', 'v', 'precipitation', 'precip', 'rainfall']
    
    for name in lon_names:
        if name in col_lower:
            lon_col = col_lower[name]
            break
    
    for name in lat_names:
        if name in col_lower:
            lat_col = col_lower[name]
            break
    
    for name in value_names:
        if name in col_lower:
            value_col = col_lower[name]
            break
    
    # 如果没找到，使用前3列（假设是X, Y, Value）
    if not lon_col or not lat_col:
        cols = list(df.columns)
        if len(cols) >= 2:
            lon_col = cols[0] if not lon_col else lon_col
            lat_col = cols[1] if not lat_col else lat_col
    
    if not value_col and len(df.columns) >= 3:
        value_col = df.columns[2]
    
    return lon_col, lat_col, value_col

def is_epsg3035_coordinates(x, y):
    """检测坐标是否为EPSG:3035格式（欧洲投影坐标，数值通常>100万）"""
    if pd.isna(x) or pd.isna(y):
        return False
    # EPSG:3035坐标通常范围：X: 2000000-8000000, Y: 1000000-6000000
    return x > 1000000 and y > 1000000

def transform_coordinates_batch(x_coords, y_coords):
    """批量将EPSG:3035坐标转换为WGS84（经纬度）"""
    try:
        import pyproj
        transformer = pyproj.Transformer.from_crs("epsg:3035", "epsg:4326", always_xy=True)
        # 批量转换，效率更高
        transformed_coords = [transformer.transform(float(x), float(y)) for x, y in zip(x_coords, y_coords)]
        return transformed_coords
    except ImportError:
        return None
    except Exception:
        return None

_NC_CACHE: Dict[str, Any] = {}

def _load_threshold_grid(nc_path: str):
    """加载 NetCDF 阈值文件，返回 xarray DataArray: idf[y, x]（WGS84经纬度坐标）"""
    if not os.path.exists(nc_path):
        raise FileNotFoundError(f"NC file not found: {nc_path}")
    if nc_path in _NC_CACHE:
        return _NC_CACHE[nc_path]
    try:
        import xarray as xr
        ds = xr.open_dataset(nc_path)
        # 选第一层 duration/hazard（不同文件已代表不同重现期）
        da = ds['idf']
        if 'duration' in da.dims:
            da = da.isel(duration=0)
        if 'hazard' in da.dims:
            da = da.isel(hazard=0)
        # 确保维度顺序为 (y, x)
        if tuple(da.dims)[-2:] != ('y', 'x'):
            # 尝试重排
            target_order = [d for d in da.dims if d not in ('y', 'x')] + ['y', 'x']
            da = da.transpose(*target_order)
        _NC_CACHE[nc_path] = da
        return da
    except ImportError:
        raise ImportError("Missing dependency: xarray. Please install: pip install xarray netCDF4")
    except Exception as e:
        raise RuntimeError(f"Failed to load NC thresholds: {e}")

def _sample_thresholds(da, lons: List[float], lats: List[float], method: str = 'nearest'):
    """在阈值栅格上批量采样阈值，支持最近邻或线性插值。返回 numpy.ndarray"""
    import numpy as np
    import xarray as xr
    if not isinstance(da, xr.DataArray):
        raise ValueError("da must be an xarray.DataArray")
    # x/y 坐标名约定：x=经度, y=纬度
    x_name = 'x'
    y_name = 'y'
    # 统一使用 interp，method 取 'nearest' 或 'linear'，可稳定处理批量坐标
    interp_method = 'nearest' if method == 'nearest' else 'linear'
    sampled = da.interp({x_name: (['pts'], lons), y_name: (['pts'], lats)}, method=interp_method).values
    sampled = np.asarray(sampled)
    # 如果 shape 为 (pts,) 直接返回；若为 (1,1,pts) 等，压缩
    sampled = np.squeeze(sampled)
    return sampled

def _estimate_return_period(r: float, t2: Optional[float], t5: Optional[float], t20: Optional[float]) -> Tuple[str, Optional[float]]:
    """根据R与 2/5/20年阈值的关系，给出区间和一个简单的估算值（线性插值）。"""
    import math
    if r is None or any(v is None for v in [t2, t5, t20]):
        return "unknown", None
    # 区间
    if r < t2:
        band = "<2y"
        # 外推（保守）：按 [1y,2y] 线性外推估个 1-2 之间的值（用 t2 做尺度）
        rp = max(1.0, 2.0 * (r / t2)) if t2 > 0 else 1.0
        return band, rp
    if r < t5:
        band = "2-5y"
        rp = 2.0 + (r - t2) / max(t5 - t2, 1e-6) * 3.0
        return band, rp
    if r < t20:
        band = "5-20y"
        rp = 5.0 + (r - t5) / max(t20 - t5, 1e-6) * 15.0
        return band, rp
    # >=20y
    band = ">=20y"
    # 简单外推：每再增加 (t20 - t5) 的幅度，增加 15 年（与上段一致的尺度）
    step = max(t20 - t5, 1e-6)
    rp = 20.0 + max(0.0, (r - t20) / step) * 15.0
    return band, rp

def main():
    args = {}
    if len(sys.argv) > 1:
        try:
            arg_str = sys.argv[1].strip()
            if arg_str.startswith("'") and arg_str.endswith("'"):
                arg_str = arg_str[1:-1]
            if arg_str.startswith('"') and arg_str.endswith('"'):
                arg_str = arg_str[1:-1]
            args = json.loads(arg_str)
        except json.JSONDecodeError as e:
            error_msg = json.dumps({
                "success": False,
                "error": f"Invalid JSON input: {str(e)}",
                "received": sys.argv[1][:100] if len(sys.argv) > 1 else "no args"
            }, ensure_ascii=False)
            print(error_msg, file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            error_msg = json.dumps({
                "success": False,
                "error": f"Error parsing arguments: {str(e)}",
                "received": sys.argv[1][:100] if len(sys.argv) > 1 else "no args"
            }, ensure_ascii=False)
            print(error_msg, file=sys.stderr)
            sys.exit(1)
    
    input_file = args.get('input_file')
    if not input_file or not os.path.exists(input_file):
        error_msg = json.dumps({
            "success": False,
            "error": f"Input file not found: {input_file}"
        }, ensure_ascii=False)
        print(error_msg, file=sys.stderr)
        sys.exit(1)
    
    geojson_file = args.get('geojson_file')
    # 行政区落区：可选 NUTS（省级）与 LAU（市级）数据源（支持 GeoPackage/GeoJSON）
    nuts_file = args.get('nuts_file')  # 例如: data/NUTS_RG_20M_2021_4326.gpkg 或 .geojson
    nuts_layer = args.get('nuts_layer')  # GPKG 图层名（可选）
    lau_file = args.get('lau_file')  # 例如: data/LAU_2024.gpkg 或 .geojson
    lau_layer = args.get('lau_layer')  # GPKG 图层名（可选）
    # 设置固定阈值（大于50才保留）
    value_threshold = args.get('value_threshold', 50.0)  # 默认阈值为50
    # 如果用户没有提供阈值，使用固定阈值50.0
    if value_threshold is None:
        value_threshold = 50.0
    
    # 网格阈值/重现期相关配置
    threshold_mode = str(args.get('threshold_mode', 'fixed')).lower()  # fixed | grid
    # 指定用于筛选的“几年一遇”版本：002y/005y/020y
    grid_rp_for_filter = str(args.get('grid_rp_for_filter', '005y')).lower()
    grid_interp_method = str(args.get('grid_interp_method', 'nearest')).lower()  # nearest | linear
    # 各重现期阈值文件路径（可只给一个；若都提供，则可输出三个阈值与RP估算）
    rp_files = {
        '002y': args.get('nc_002y'),
        '005y': args.get('nc_005y'),
        '020y': args.get('nc_020y'),
    }
    # 回退阈值（越界/NaN）
    grid_fallback = float(args.get('grid_fallback', value_threshold))
    # 是否输出阈值与RP列
    output_rp_columns = bool(args.get('output_rp_columns', True))
    
    max_points = args.get('max_points', 1000)
    enable_coord_transform = args.get('enable_coord_transform', True)
    take_max_per_polygon = args.get('take_max_per_polygon', True)
    
    try:
        print(f"[Progress] Starting processing... Input file: {input_file}", file=sys.stderr)
        
        # 读取数据文件（支持无表头，优先使用制表符分隔）
        print("[Progress] Reading data file...", file=sys.stderr)
        file_ext = os.path.splitext(input_file)[1].lower()
        if file_ext in ['.csv', '.txt']:
            # 先尝试制表符分隔（与原始脚本一致）
            try:
                df = pd.read_csv(input_file, sep='\t', header=None, names=['x', 'y', 'value'], engine='python')
                print(f"[Progress] Read {len(df)} rows with tab separator", file=sys.stderr)
            except:
                # 如果制表符失败，尝试自动检测
                with open(input_file, 'r', encoding='utf-8') as f:
                    first_line = f.readline().strip()
                    has_header = not first_line.replace('.', '').replace('-', '').replace('\t', '').replace(' ', '').isdigit()
                
                df = None
                for sep in ['\t', ',', ' ', ';']:
                    try:
                        df = pd.read_csv(input_file, sep=sep, header=None if not has_header else 0, engine='python')
                        if len(df.columns) >= 2:
                            break
                    except:
                        continue
                
                if df is None or len(df.columns) < 2:
                    df = pd.read_csv(input_file, sep='\t', header=None, engine='python')
        elif file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(input_file, header=None)
        else:
            error_msg = json.dumps({
                "success": False,
                "error": f"Unsupported file format: {file_ext}"
            }, ensure_ascii=False)
            print(error_msg, file=sys.stderr)
            sys.exit(1)
        
        # 如果列名是数字（无表头），重命名为x, y, value
        if len(df.columns) >= 3 and all(isinstance(col, (int, float)) for col in df.columns[:3]):
            df.columns = ['x', 'y', 'value'] + [f'col_{i}' for i in range(3, len(df.columns))]
        elif len(df.columns) >= 2:
            df.columns = ['x', 'y'] + [f'col_{i}' for i in range(2, len(df.columns))]
            if len(df.columns) >= 3:
                df.columns = ['x', 'y', 'value'] + list(df.columns[3:])
        
        # 检测列
        lon_col, lat_col, value_col = detect_coordinate_columns(df)
        
        if not lon_col or not lat_col:
            error_msg = json.dumps({
                "success": False,
                "error": "Cannot detect longitude/latitude columns"
            }, ensure_ascii=False)
            print(error_msg, file=sys.stderr)
            sys.exit(1)
        
        # 提取有效点
        df_valid = df[[lon_col, lat_col]].copy()
        df_valid['x_raw'] = pd.to_numeric(df_valid[lon_col], errors='coerce')
        df_valid['y_raw'] = pd.to_numeric(df_valid[lat_col], errors='coerce')
        
        if value_col:
            df_valid['value'] = pd.to_numeric(df[value_col], errors='coerce')
        else:
            df_valid['value'] = 0
        
        # 移除无效值
        df_valid = df_valid.dropna(subset=['x_raw', 'y_raw'])
        
        print(f"[Progress] Valid points: {len(df_valid)}", file=sys.stderr)
        
        # 检测是否需要坐标转换
        sample_x = df_valid['x_raw'].iloc[0] if len(df_valid) > 0 else 0
        sample_y = df_valid['y_raw'].iloc[0] if len(df_valid) > 0 else 0
        needs_transform = enable_coord_transform and is_epsg3035_coordinates(sample_x, sample_y)
        
        print(f"[Progress] Coordinate transform needed: {needs_transform}", file=sys.stderr)
        
        # 进行坐标转换（如果需要）
        if needs_transform:
            print("[Progress] Transforming coordinates (EPSG:3035 -> WGS84)...", file=sys.stderr)
            try:
                # 批量转换坐标，效率更高（与原始脚本一致）
                transformed_coords = transform_coordinates_batch(
                    df_valid['x_raw'].tolist(), 
                    df_valid['y_raw'].tolist()
                )
                if transformed_coords:
                    df_valid[['longitude', 'latitude']] = pd.DataFrame(
                        transformed_coords, 
                        index=df_valid.index
                    )
                    df_valid = df_valid.dropna(subset=['longitude', 'latitude'])
                    print(f"[Progress] Coordinates transformed: {len(df_valid)} points", file=sys.stderr)
                else:
                    raise Exception("Coordinate transformation returned None")
            except Exception as e:
                print(f"[Warning] Coordinate transform failed: {str(e)}, using raw coordinates", file=sys.stderr)
                df_valid['longitude'] = df_valid['x_raw']
                df_valid['latitude'] = df_valid['y_raw']
        else:
            df_valid['longitude'] = df_valid['x_raw']
            df_valid['latitude'] = df_valid['y_raw']
        
        # 应用阈值筛选（支持 fixed / grid）
        if value_col:
            # 统一数值类型
            df_valid['value'] = pd.to_numeric(df_valid['value'], errors='coerce')
            before_count = len(df_valid)
            if threshold_mode == 'grid':
                print(f"[Progress] Threshold mode: grid ({grid_rp_for_filter}), method={grid_interp_method}", file=sys.stderr)
                # 准备需要的阈值网格
                da_002 = _load_threshold_grid(rp_files['002y']) if rp_files.get('002y') else None
                da_005 = _load_threshold_grid(rp_files['005y']) if rp_files.get('005y') else None
                da_020 = _load_threshold_grid(rp_files['020y']) if rp_files.get('020y') else None
                if grid_rp_for_filter not in rp_files or not rp_files[grid_rp_for_filter]:
                    # 若未提供指定RP文件，退回 fixed
                    print(f"[Warning] Missing NC for selected RP {grid_rp_for_filter}, fallback to fixed {value_threshold}", file=sys.stderr)
                    thr_for_filter = pd.Series([value_threshold] * len(df_valid), index=df_valid.index)
                else:
                    da_sel = {'002y': da_002, '005y': da_005, '020y': da_020}[grid_rp_for_filter]
                    vals = _sample_thresholds(
                        da_sel,
                        df_valid['longitude'].tolist(),
                        df_valid['latitude'].tolist(),
                        method=grid_interp_method
                    )
                    # 回退处理
                    import numpy as np
                    vals = np.where(~pd.isna(vals), vals, grid_fallback)
                    thr_for_filter = pd.Series(vals, index=df_valid.index, dtype='float64')
                    df_valid[f'threshold_{grid_rp_for_filter}'] = thr_for_filter
                # 计算其它阈值与RP（如需）
                if output_rp_columns:
                    import numpy as np
                    if da_002 is not None:
                        v2 = _sample_thresholds(da_002, df_valid['longitude'].tolist(), df_valid['latitude'].tolist(), method=grid_interp_method)
                        v2 = np.where(~pd.isna(v2), v2, grid_fallback)
                        df_valid['threshold_2y'] = v2
                    if da_005 is not None:
                        v5 = _sample_thresholds(da_005, df_valid['longitude'].tolist(), df_valid['latitude'].tolist(), method=grid_interp_method)
                        v5 = np.where(~pd.isna(v5), v5, grid_fallback)
                        df_valid['threshold_5y'] = v5
                    if da_020 is not None:
                        v20 = _sample_thresholds(da_020, df_valid['longitude'].tolist(), df_valid['latitude'].tolist(), method=grid_interp_method)
                        v20 = np.where(~pd.isna(v20), v20, grid_fallback)
                        df_valid['threshold_20y'] = v20
                    # 估算重现期
                    if all(col in df_valid.columns for col in ['threshold_2y', 'threshold_5y', 'threshold_20y']):
                        bands = []
                        rps = []
                        for r, t2, t5, t20 in zip(df_valid['value'].tolist(), df_valid['threshold_2y'].tolist(), df_valid['threshold_5y'].tolist(), df_valid['threshold_20y'].tolist()):
                            band, rp = _estimate_return_period(r, t2, t5, t20)
                            bands.append(band)
                            rps.append(rp)
                        df_valid['return_period_band'] = bands
                        df_valid['return_period_estimate'] = rps
                # 使用选择的RP阈值进行筛选（>= 阈值）
                df_valid = df_valid[df_valid['value'] > thr_for_filter]
                df_valid = df_valid.sort_values(by='value', ascending=False)
                print(f"[Progress] After grid-threshold: {len(df_valid)}/{before_count} points (rp={grid_rp_for_filter})", file=sys.stderr)
            else:
                print(f"[Progress] Applying fixed threshold: value >= {value_threshold}", file=sys.stderr)
                df_valid = df_valid[df_valid['value'] > value_threshold]
                df_valid = df_valid.sort_values(by='value', ascending=False)
                print(f"[Progress] After fixed threshold: {len(df_valid)}/{before_count} points", file=sys.stderr)
        else:
            print(f"[Progress] No value column found, skipping threshold filter", file=sys.stderr)
        
        # 如果提供了GeoJSON文件，进行空间筛选
        final_points = df_valid
        if geojson_file and os.path.exists(geojson_file):
            try:
                print(f"[Progress] Loading GeoJSON file: {geojson_file}", file=sys.stderr)
                import geopandas as gpd
                from shapely.geometry import Point
                
                print("[Progress] Reading GeoJSON...", file=sys.stderr)
                # 读取GeoJSON
                gdf_base = gpd.read_file(geojson_file)
                print(f"[Progress] GeoJSON loaded: {len(gdf_base)} polygons", file=sys.stderr)
                
                if gdf_base.crs != "EPSG:4326":
                    print("[Progress] Converting CRS to EPSG:4326...", file=sys.stderr)
                    gdf_base = gdf_base.to_crs(epsg=4326)
                
                print(f"[Progress] Creating point geometry from {len(df_valid)} points...", file=sys.stderr)
                # 将点数据转换为GeoDataFrame
                geometry = [Point(xy) for xy in zip(df_valid['longitude'], df_valid['latitude'])]
                gdf_points = gpd.GeoDataFrame(df_valid, geometry=geometry, crs="EPSG:4326")
                
                print("[Progress] Performing spatial join...", file=sys.stderr)
                # 空间筛选：找出在GeoJSON区域内的点
                points_within = gpd.sjoin(gdf_points, gdf_base, how="inner", predicate="within")
                print(f"[Progress] Found {len(points_within)} points within polygons", file=sys.stderr)
                
                if not points_within.empty:
                    if take_max_per_polygon:
                        print("[Progress] Taking max value per polygon...", file=sys.stderr)
                        print(f"[Progress] Points before max selection: {len(points_within)}", file=sys.stderr)
                        # 每个多边形区域内取最大值点
                        # 先按 value 降序排序，确保最大值在前
                        sorted_points = points_within.sort_values(by='value', ascending=False)
                        # 检查 index_right 列是否存在
                        if 'index_right' not in sorted_points.columns:
                            print("[Warning] index_right column not found, cannot perform max per polygon selection", file=sys.stderr)
                            final_points = sorted_points
                        else:
                            # 按 index_right 去重，保留每个多边形的第一个（最大值）点
                            final_points = sorted_points.drop_duplicates(subset='index_right', keep='first').copy()
                            print(f"[Progress] Final points after max selection: {len(final_points)} (from {len(points_within)} points)", file=sys.stderr)
                            # 验证：显示每个多边形的最大值
                            if len(final_points) > 0:
                                max_values = final_points.groupby('index_right')['value'].max()
                                print(f"[Progress] Max values per polygon: {len(max_values)} polygons, range: {max_values.min():.2f} - {max_values.max():.2f}", file=sys.stderr)
                    else:
                        # 保留所有在区域内的点
                        final_points = points_within
                    # 从域 GeoJSON 中提取国家/省（优先使用 NAME，如 ES_Murcia）
                    try:
                        base_cols = set(final_points.columns)
                        # 先强制使用 NAME 系列列解析（避免依赖其它字段）
                        name_candidates = ['NAME', 'NAME_right', 'NAME_left', 'name', 'Name']
                        name_col = next((c for c in name_candidates if c in base_cols), None)
                        if name_col:
                            def parse_name(val):
                                s = str(val) if val is not None else ''
                                if '_' in s:
                                    cc, prov = s.split('_', 1)
                                    return cc.strip(), prov.replace('_', ' ').strip()
                                # 无下划线时，认为整列就是省名（国家码留空）
                                return None, s.strip()
                            parsed = final_points[name_col].map(parse_name)
                            final_points['country_code'] = parsed.map(lambda x: x[0] if x else None)
                            final_points['province_name'] = parsed.map(lambda x: x[1] if x else None)
                        
                        # 以下为兼容兜底（若 NAME 不存在时才尝试）
                        base_cols = set(final_points.columns)
                        # 常见国家字段
                        country_candidates = ['CNTR_CODE', 'country', 'COUNTRY', 'CNTR', 'CNTR_NAME', 'CNTRNAME', 'ISO2', 'ISO3']
                        # 常见省/区域（NUTS）名称字段（注意：你的域GeoJSON里使用 NAME 组合字段）
                        province_candidates = ['NUTS_NAME', 'NAME_LATN', 'NAME_ENGL', 'NAME', 'NAME_EN', 'nuts_name']
                        country_col = next((c for c in country_candidates if c in base_cols), None)
                        province_col = next((c for c in province_candidates if c in base_cols), None)
                        # 特例：如果存在 NAME（如 "ES_Murcia"），优先用它解析
                        if 'NAME' in base_cols:
                            def _parse_name(val):
                                try:
                                    s = str(val)
                                    if '_' in s:
                                        cc, rest = s.split('_', 1)
                                        return cc, rest.replace('_', ' ').strip()
                                except Exception:
                                    pass
                                return None, None
                            parsed = final_points['NAME'].map(_parse_name)
                            final_points['country_code_from_name'] = parsed.map(lambda x: x[0] if x else None)
                            final_points['province_from_name'] = parsed.map(lambda x: x[1] if x else None)
                        else:
                            final_points['country_code_from_name'] = None
                            final_points['province_from_name'] = None
                        # 统一国家代码：优先 NAME 解析，其次 country_col
                        if 'country_code_from_name' in final_points.columns:
                            final_points['country_code'] = final_points['country_code_from_name']
                        if country_col:
                            final_points['country_code'] = final_points['country_code'].fillna(final_points[country_col]) if 'country_code' in final_points.columns else final_points[country_col]
                        # 统一省名：优先 NAME 解析，其次 province_col
                        if 'province_from_name' in final_points.columns:
                            final_points['province_name'] = final_points['province_from_name']
                        if province_col:
                            # 若为空或疑似代码，再回退到 province_col
                            try:
                                import re
                                code_like = re.compile(r'^[A-Z]{2,3}[-_]?\w{2,5}$')
                                base = final_points['province_name'] if 'province_name' in final_points.columns else None
                                if base is not None:
                                    mask_na = base.isna() | (base.astype(str).str.strip() == '') | base.astype(str).str.match(code_like)
                                    final_points.loc[mask_na, 'province_name'] = final_points.loc[mask_na, province_col]
                                else:
                                    final_points['province_name'] = final_points[province_col]
                            except Exception:
                                final_points['province_name'] = final_points[province_col]
                        # 如果通过 NAME 解析不到省名，或省名看起来像代码（如 ES511），则回退到 province_col
                        try:
                            import re
                            code_like = re.compile(r'^[A-Z]{2,3}[-_]?\w{2,5}$')
                            if 'province_name' in final_points.columns and province_col and province_col in final_points.columns:
                                mask_na = final_points['province_name'].isna() | (final_points['province_name'].astype(str).str.strip() == '')
                                mask_code = final_points['province_name'].astype(str).str.match(code_like)
                                fallback_mask = mask_na | mask_code
                                if fallback_mask.any():
                                    final_points.loc[fallback_mask, 'province_name'] = final_points.loc[fallback_mask, province_col]
                        except Exception:
                            pass
                        if country_col:
                            # 简单国家码到名称映射
                            code_to_name = {
                                'ES': 'Spain', 'PT': 'Portugal', 'FR': 'France', 'DE': 'Germany', 'IT': 'Italy',
                                'NO': 'Norway', 'SE': 'Sweden', 'FI': 'Finland', 'DK': 'Denmark', 'NL': 'Netherlands',
                                'BE': 'Belgium', 'LU': 'Luxembourg', 'IE': 'Ireland', 'GB': 'United Kingdom', 'UK': 'United Kingdom',
                                'HR': 'Croatia', 'RO': 'Romania', 'BG': 'Bulgaria', 'GR': 'Greece', 'PL': 'Poland', 'CZ': 'Czechia',
                                'AT': 'Austria'
                            }
                            # 如果已经从 NAME/其它列得到 country_code，则优先用该列映射
                            if 'country_code' in final_points.columns:
                                final_points['country_name'] = final_points['country_code'].map(lambda x: code_to_name.get(str(x), str(x)))
                            else:
                                final_points['country_name'] = final_points[country_col].map(lambda x: code_to_name.get(str(x), str(x)))
                        # 日志（样例值）
                        try:
                            sample_cc = (final_points['country_code'].dropna().astype(str).head(1).tolist() or [''])[0]
                            sample_prov = (final_points['province_name'].dropna().astype(str).head(1).tolist() or [''])[0]
                        except Exception:
                            sample_cc = ''
                            sample_prov = ''
                        print(f"[Progress] Attributes from domain join: name_col={name_col}, country_col={country_col}, province_col={province_col}, sample=({sample_cc}, {sample_prov})", file=sys.stderr)
                    except Exception as _attr_err:
                        print(f"[Warning] Failed to map attributes from domain polygons: {_attr_err}", file=sys.stderr)
                else:
                    # 没有点在区域内，返回空结果
                    print("[Progress] No points found within polygons", file=sys.stderr)
                    final_points = points_within
                    
            except ImportError as e:
                error_msg = json.dumps({
                    "success": False,
                    "error": f"Required library missing: {str(e)}. Please install: pip install geopandas shapely pyproj"
                }, ensure_ascii=False)
                print(error_msg, file=sys.stderr)
                sys.exit(1)
            except Exception as e:
                import traceback
                error_msg = json.dumps({
                    "success": False,
                    "error": f"GeoJSON processing error: {str(e)}",
                    "traceback": traceback.format_exc()
                }, ensure_ascii=False)
                print(error_msg, file=sys.stderr)
                sys.exit(1)
        
        # 行政区落区（在最终点集基础上进行，可与 GeoJSON 过滤配合）
        province_name_col = None
        city_name_col = None
        points_gdf_for_join = None
        try:
            if len(final_points) > 0 and ('longitude' in final_points.columns and 'latitude' in final_points.columns):
                # 防止上一次 sjoin 遗留的 index_right 列与下一次 sjoin 冲突
                if 'index_right' in final_points.columns:
                    try:
                        final_points = final_points.drop(columns=['index_right'])
                    except Exception:
                        pass
                try:
                    import geopandas as gpd
                    from shapely.geometry import Point
                except ImportError:
                    gpd = None
                if gpd is not None:
                    # 将最终点集转为 GeoDataFrame
                    geometry = [Point(xy) for xy in zip(final_points['longitude'], final_points['latitude'])]
                    points_gdf_for_join = gpd.GeoDataFrame(final_points.copy(), geometry=geometry, crs="EPSG:4326")
                    # 再次确保不存在 index_right 列（避免与 sjoin 生成列名冲突）
                    if 'index_right' in points_gdf_for_join.columns:
                        try:
                            points_gdf_for_join = points_gdf_for_join.drop(columns=['index_right'])
                        except Exception:
                            pass

                    # 不再执行 NUTS 省级 sjoin；省名已由域 GeoJSON 提供

                    # 市级（LAU）：仅取 LAU_NAME 为 city_name
                    if lau_file and os.path.exists(lau_file):
                        print(f"[Progress] Loading LAU for city join: {lau_file}", file=sys.stderr)
                        lau_gdf = gpd.read_file(lau_file, layer=lau_layer) if lau_layer else gpd.read_file(lau_file)
                        if lau_gdf.crs != "EPSG:4326":
                            lau_gdf = lau_gdf.to_crs(epsg=4326)
                        city_name_col = None
                        for c in ['LAU_NAME', 'LAU_NAME_right', 'LAU_NAME_left']:
                            if c in lau_gdf.columns:
                                city_name_col = c
                                break
                        select_cols = [city_name_col, 'geometry'] if city_name_col else ['geometry']
                        lau_gdf = lau_gdf[select_cols]
                        joined = gpd.sjoin(points_gdf_for_join, lau_gdf, how='left', predicate='within')
                        if city_name_col and city_name_col in joined.columns:
                            points_gdf_for_join['city_name'] = joined[city_name_col]
                        else:
                            points_gdf_for_join['city_name'] = None
                        # 不写入/覆盖国家与省
                    else:
                        points_gdf_for_join = points_gdf_for_join.assign(city_name=None)

                    # 回写到 DataFrame（保留非几何列）
                    if points_gdf_for_join is not None:
                        final_points = pd.DataFrame(points_gdf_for_join.drop(columns=['geometry']))
        except Exception as e:
            print(f"[Warning] NUTS/LAU join failed: {str(e)}", file=sys.stderr)

        # 限制点数
        if len(final_points) > max_points:
            final_points = final_points.head(max_points)
        
        # 构建结果
        points = []
        for _, row in final_points.iterrows():
            item = {
                "longitude": float(row['longitude']),
                "latitude": float(row['latitude']),
                "value": float(row['value']) if pd.notna(row['value']) else None
            }
            # 附加阈值/重现期信息（如有）
            for c in ['threshold_2y', 'threshold_5y', 'threshold_20y', f'threshold_{grid_rp_for_filter}', 'return_period_band', 'return_period_estimate']:
                if c in final_points.columns and pd.notna(row.get(c)):
                    v = row.get(c)
                    item[c] = float(v) if isinstance(v, (int, float)) and pd.notna(v) else (str(v) if v is not None else None)
            # 附加行政区（如果有）
            if 'province_name' in row and pd.notna(row['province_name']):
                item['province_name'] = str(row['province_name'])
            if 'city_name' in row and pd.notna(row['city_name']):
                item['city_name'] = str(row['city_name'])
            if 'country_code' in row and pd.notna(row['country_code']):
                code = str(row['country_code'])
                item['country_code'] = code
                # 简单国家码到名称映射（可按需补充）
                code_to_name = {
                    'ES': 'Spain', 'PT': 'Portugal', 'FR': 'France', 'DE': 'Germany', 'IT': 'Italy',
                    'NO': 'Norway', 'SE': 'Sweden', 'FI': 'Finland', 'DK': 'Denmark', 'NL': 'Netherlands',
                    'BE': 'Belgium', 'LU': 'Luxembourg', 'IE': 'Ireland', 'GB': 'United Kingdom',
                    'UK': 'United Kingdom', 'HR': 'Croatia', 'RO': 'Romania', 'BG': 'Bulgaria',
                    'GR': 'Greece', 'PL': 'Poland', 'CZ': 'Czechia', 'AT': 'Austria'
                }
                item['country_name'] = code_to_name.get(code, code)
            points.append(item)
        
        result = {
            "success": True,
            "summary": {
                "total_points": len(points),
                "value_threshold": float(value_threshold),
                "threshold_mode": threshold_mode,
                "grid_rp_for_filter": grid_rp_for_filter if threshold_mode == 'grid' else None,
                "grid_interp_method": grid_interp_method if threshold_mode == 'grid' else None,
                "max_points": int(max_points),
                "coordinate_transform": bool(needs_transform),
                "geojson_filtered": bool(geojson_file is not None and os.path.exists(geojson_file) if geojson_file else False),
                "total_before_filter": len(df_valid),
                "points_after_geojson": len(final_points) if geojson_file else None,
                "lau_join": bool(lau_file is not None and os.path.exists(lau_file) if lau_file else False)
            },
            "points": points
        }
        
        print("[Progress] Generating output...", file=sys.stderr)
        try:
            # 使用 UTF-8 明确输出，避免 Windows 上 GBK 编码报错
            sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            sys.stdout.buffer.write(b"\n")
            sys.stdout.flush()
        except Exception as enc_err:
            # 退化到安全替代：强制 ASCII 转义，保证不中断
            fallback = json.dumps(result, ensure_ascii=True)
            sys.stdout.buffer.write(fallback.encode('ascii', errors='ignore'))
            sys.stdout.buffer.write(b"\n")
            sys.stdout.flush()
        print("[Progress] Done!", file=sys.stderr)
        
    except Exception as e:
        import traceback
        error_msg = json.dumps({
            "success": False,
            "error": f"Processing error: {str(e)}",
            "traceback": traceback.format_exc()
        }, ensure_ascii=False)
        print(error_msg, file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
