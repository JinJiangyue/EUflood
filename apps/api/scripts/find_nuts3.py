#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
根据坐标点查找所在的NUTS3区域
输入：经纬度坐标
输出：包含该点的NUTS3区域的GeoJSON
"""

import json
import sys
import os
import geopandas as gpd
from shapely.geometry import Point

def find_nuts3_for_point(lon: float, lat: float, nuts_file: str = None) -> dict:
    """
    根据坐标点查找所在的NUTS3区域
    
    Args:
        lon: 经度
        lat: 纬度
        nuts_file: NUTS3数据文件路径（可选，会自动查找）
    
    Returns:
        包含该点的NUTS3区域的GeoJSON字典，如果未找到则返回None
    """
    try:
        # 如果没有提供NUTS文件，尝试查找默认位置
        if not nuts_file:
            # 尝试从环境变量或默认路径查找
            script_dir = os.path.dirname(os.path.abspath(__file__))
            # 默认在 apps/uploads/geofile/nuts3/ 目录下
            default_paths = [
                os.path.join(script_dir, '../../uploads/geofile/nuts3/NUTS_RG_20M_2021_4326.gpkg'),
                os.path.join(script_dir, '../../uploads/geofile/nuts3/NUTS_RG_20M_2021_4326.geojson'),
                os.path.join(script_dir, '../../uploads/geofile/nuts3/domain_xinyu_20250729_093415.geojson'),
            ]
            
            for p in default_paths:
                abs_path = os.path.abspath(p)
                if os.path.exists(abs_path):
                    nuts_file = abs_path
                    break
        
        if not nuts_file or not os.path.exists(nuts_file):
            return {
                'success': False,
                'error': f'NUTS3 file not found. Please provide nuts_file parameter.'
            }
        
        # 读取NUTS3数据
        print(f"[FindNUTS3] Loading NUTS3 file: {nuts_file}", file=sys.stderr)
        gdf_nuts = gpd.read_file(nuts_file)
        
        # 确保坐标系为WGS84
        if gdf_nuts.crs != "EPSG:4326":
            gdf_nuts = gdf_nuts.to_crs(epsg=4326)
        
        # 创建点
        point = Point(lon, lat)
        point_gdf = gpd.GeoDataFrame([1], geometry=[point], crs="EPSG:4326")
        
        # 空间连接：找到包含该点的NUTS3区域
        joined = gpd.sjoin(point_gdf, gdf_nuts, how='left', predicate='within')
        
        if joined.empty or joined.iloc[0]['index_right'] is None:
            return {
                'success': False,
                'error': f'Point ({lon}, {lat}) is not within any NUTS3 region.'
            }
        
        # 获取匹配的NUTS3区域
        matched_index = joined.iloc[0]['index_right']
        matched_region = gdf_nuts.iloc[matched_index]
        
        # 转换为GeoJSON格式
        # 使用 geopandas 的 to_json 方法直接生成 GeoJSON
        matched_gdf = gpd.GeoDataFrame([matched_region], crs="EPSG:4326")
        geojson_str = matched_gdf.to_json()
        result_geojson = json.loads(geojson_str)
        
        # 提取属性（用于返回信息）
        properties = matched_region.drop('geometry').to_dict()
        
        print(f"[FindNUTS3] Found NUTS3 region: {properties.get('NUTS_NAME', properties.get('NAME', 'Unknown'))}", file=sys.stderr)
        
        return {
            'success': True,
            'geojson': result_geojson,
            'properties': properties
        }
        
    except Exception as e:
        import traceback
        error_msg = f"Error finding NUTS3 region: {str(e)}\n{traceback.format_exc()}"
        print(f"[FindNUTS3] {error_msg}", file=sys.stderr)
        return {
            'success': False,
            'error': error_msg
        }

def main():
    """主函数：从命令行参数读取坐标并查找NUTS3区域"""
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
                'success': False,
                'error': f'Invalid JSON arguments: {str(e)}'
            })
            print(error_msg, file=sys.stderr)
            sys.exit(1)
    
    lon = args.get('lon')
    lat = args.get('lat')
    nuts_file = args.get('nuts_file')
    
    if lon is None or lat is None:
        error_msg = json.dumps({
            'success': False,
            'error': 'lon and lat are required'
        })
        print(error_msg, file=sys.stderr)
        sys.exit(1)
    
    try:
        lon = float(lon)
        lat = float(lat)
    except (ValueError, TypeError):
        error_msg = json.dumps({
            'success': False,
            'error': 'lon and lat must be numeric'
        })
        print(error_msg, file=sys.stderr)
        sys.exit(1)
    
    result = find_nuts3_for_point(lon, lat, nuts_file)
    
    # 输出JSON结果
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()

