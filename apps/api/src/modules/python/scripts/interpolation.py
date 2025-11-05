import pandas as pd
import json
import sys
import os

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
    # 设置固定阈值（大于50才保留）
    value_threshold = args.get('value_threshold', 50.0)  # 默认阈值为50
    # 如果用户没有提供阈值，使用固定阈值50.0
    if value_threshold is None:
        value_threshold = 50.0
    
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
        
        # 应用阈值筛选（固定阈值，始终执行）
        if value_col:
            print(f"[Progress] Applying threshold filter: value > {value_threshold}...", file=sys.stderr)
            before_count = len(df_valid)
            # 确保value列是数值类型
            df_valid['value'] = pd.to_numeric(df_valid['value'], errors='coerce')
            # 应用阈值筛选：只保留值大于阈值的点
            df_valid = df_valid[df_valid['value'] > value_threshold]
            # 按value从大到小排序（与原始脚本一致）
            df_valid = df_valid.sort_values(by='value', ascending=False)
            print(f"[Progress] After threshold: {len(df_valid)}/{before_count} points (threshold: {value_threshold})", file=sys.stderr)
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
                        # 每个多边形区域内取最大值点
                        sorted_points = points_within.sort_values(by='value', ascending=False)
                        final_points = sorted_points.drop_duplicates(subset='index_right', keep='first').copy()
                        print(f"[Progress] Final points after max selection: {len(final_points)}", file=sys.stderr)
                    else:
                        # 保留所有在区域内的点
                        final_points = points_within
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
        
        # 限制点数
        if len(final_points) > max_points:
            final_points = final_points.head(max_points)
        
        # 构建结果
        points = []
        for _, row in final_points.iterrows():
            points.append({
                "longitude": float(row['longitude']),
                "latitude": float(row['latitude']),
                "value": float(row['value']) if pd.notna(row['value']) else None
            })
        
        result = {
            "success": True,
            "summary": {
                "total_points": len(points),
                "value_threshold": float(value_threshold),
                "max_points": int(max_points),
                "coordinate_transform": bool(needs_transform),
                "geojson_filtered": bool(geojson_file is not None and os.path.exists(geojson_file) if geojson_file else False),
                "total_before_filter": len(df_valid),
                "points_after_geojson": len(final_points) if geojson_file else None
            },
            "points": points
        }
        
        print("[Progress] Generating output...", file=sys.stderr)
        print(json.dumps(result, ensure_ascii=False))
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
