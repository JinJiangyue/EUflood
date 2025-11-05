#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 interpolation.py 脚本
直接运行此文件进行测试，无需通过网页

使用方法：
1. 直接运行：python test_interpolation.py
2. 或修改下面的测试参数后运行
"""

import json
import sys
import os
from pathlib import Path

# ============================================
# 测试配置（在这里修改测试参数）
# ============================================

# 测试数据文件路径（请根据实际情况修改）
# 方式1：使用相对路径（相对于脚本目录）
TEST_DATA_FILE = 'test_data.txt'  # 或使用绝对路径，如：r'E:\Project\europe\apps\api\uploads\your_file.txt'

# 方式2：使用绝对路径（取消注释并修改）
# TEST_DATA_FILE = r'E:\Project\europe\apps\api\uploads\your_uploaded_file.txt'

# GeoJSON文件（可选，如果不需要空间筛选可以设为None）
GEOJSON_FILE = 'data/domain_xinyu_20250729_093415.geojson'  # 相对路径
# GEOJSON_FILE = None  # 如果不需要GeoJSON筛选，设为None

# 固定阈值（值大于此值才保留）
VALUE_THRESHOLD = 50.0

# 最大点数
MAX_POINTS = 1000

# 是否启用坐标转换（EPSG:3035 -> WGS84）
ENABLE_COORD_TRANSFORM = True

# 是否每个多边形区域只取最大值点
TAKE_MAX_PER_POLYGON = True

# ============================================
# 测试代码（通常不需要修改）
# ============================================

# 添加当前目录到路径
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

def create_test_data_file(file_path):
    """创建示例测试数据文件"""
    sample_data = """3562647.86574855	2076953.23932178	2.4
4439897.85055016	3847618.21344455	0.0
4421927.02143045	2589031.26428981	0.0
3778921.18017872	2295123.48513287	0.0
4591051.30347376	2697090.21332727	0.0
4214883.71461095	2616448.0367881	0.0
6205212.47211343	3006230.5024645	0.2
6217883.50508252	2970260.29228566	0.0
3512974.88415627	3486397.23085781	0.3
5828086.87454042	3281365.18924123	0.5
2801556.07492185	2249194.5335702	0.0
4760315.84615495	2768336.68263591	0.0
3637775.90139605	3237540.62888625	0.0
4194070.32843873	3394292.0945667	0.0
4074683.10232233	2354765.87014825	0.0
3467965.02463221	2565246.63289828	0.2
3520417.98177292	2126451.76580311	0.0"""
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(sample_data)
        print(f"[测试] 示例文件已创建: {file_path}")

def test_interpolation():
    """测试插值脚本"""
    
    # 解析测试数据文件路径
    if os.path.isabs(TEST_DATA_FILE):
        test_data_file = Path(TEST_DATA_FILE)
    else:
        test_data_file = script_dir / TEST_DATA_FILE
    
    # 如果测试文件不存在，创建一个示例文件
    if not test_data_file.exists():
        print(f"[测试] 测试文件不存在: {test_data_file}")
        print(f"[测试] 正在创建示例文件...")
        create_test_data_file(test_data_file)
    
    # 解析GeoJSON文件路径
    geojson_path = None
    if GEOJSON_FILE:
        if os.path.isabs(GEOJSON_FILE):
            geojson_path = Path(GEOJSON_FILE)
        else:
            geojson_path = script_dir / GEOJSON_FILE
        
        if not geojson_path.exists():
            print(f"[测试] ⚠️ 警告: GeoJSON文件不存在: {geojson_path}")
            print(f"[测试] 将跳过空间筛选")
            geojson_path = None
    
    # 构建测试参数
    test_args = {
        'input_file': str(test_data_file),
        'value_threshold': VALUE_THRESHOLD,
        'max_points': MAX_POINTS,
        'enable_coord_transform': ENABLE_COORD_TRANSFORM,
        'take_max_per_polygon': TAKE_MAX_PER_POLYGON
    }
    
    # 如果GeoJSON文件存在，添加路径
    if geojson_path and geojson_path.exists():
        test_args['geojson_file'] = str(geojson_path)
        print(f"[测试] 使用GeoJSON文件: {geojson_path}")
    else:
        print(f"[测试] 不使用GeoJSON文件（将跳过空间筛选）")
    
    # 将参数转换为JSON字符串（模拟命令行参数）
    args_json = json.dumps(test_args, ensure_ascii=False)
    
    # 设置sys.argv（模拟命令行调用）
    sys.argv = ['interpolation.py', args_json]
    
    print("\n" + "=" * 60)
    print("[测试] 开始测试 interpolation.py")
    print("=" * 60)
    print(f"[测试] 输入文件: {test_data_file}")
    print(f"[测试] 阈值: {VALUE_THRESHOLD}（只保留值 > {VALUE_THRESHOLD} 的点）")
    print(f"[测试] GeoJSON: {geojson_path if geojson_path else '不使用'}")
    print(f"[测试] 坐标转换: {'启用' if ENABLE_COORD_TRANSFORM else '禁用'}")
    print(f"[测试] 每区域最大值: {'是' if TAKE_MAX_PER_POLYGON else '否'}")
    print(f"[测试] 最大点数: {MAX_POINTS}")
    print("-" * 60)
    print("[测试] 进度信息（stderr）:")
    print("-" * 60)
    
    try:
        # 导入并调用main函数
        from interpolation import main
        main()
        
        print("\n" + "=" * 60)
        print("[测试] 测试完成！")
        print("=" * 60)
        print("[测试] 结果已输出到 stdout（上方）")
        print("[测试] 进度信息已输出到 stderr（上方标记为[Progress]的行）")
        
    except SystemExit as e:
        # main()函数可能调用sys.exit()，这是正常的
        if e.code == 0:
            print("\n" + "=" * 60)
            print("[测试] 测试完成（正常退出）")
            print("=" * 60)
        else:
            print("\n" + "=" * 60)
            print(f"[测试] 测试失败（退出码: {e.code}）")
            print("=" * 60)
            sys.exit(e.code)
    except Exception as e:
        print("\n" + "=" * 60)
        print(f"[测试] 测试失败: {str(e)}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    test_interpolation()

