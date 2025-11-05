# 测试 interpolation.py 脚本

## 方法1：直接运行Python测试脚本（推荐）

```bash
# 进入脚本目录
cd apps/api/src/modules/python/scripts

# 使用嵌入式Python运行
../../../../python-embed/python.exe test_interpolation.py

# 或使用系统Python（如果已安装依赖）
python test_interpolation.py
```

## 方法2：直接运行interpolation.py（模拟命令行）

```bash
cd apps/api/src/modules/python/scripts

# 准备测试数据文件
# 文件格式：X坐标（制表符）Y坐标（制表符）值
# 例如：3562647.86574855	2076953.23932178	2.4

# 运行脚本（Windows PowerShell）
$args = '{"input_file":"test_data.txt","value_threshold":50.0,"geojson_file":"data/domain_xinyu_20250729_093415.geojson"}'
../../../../python-embed/python.exe interpolation.py $args

# 或使用cmd
python interpolation.py "{\"input_file\":\"test_data.txt\",\"value_threshold\":50.0}"
```

## 方法3：在Python中交互式测试

```python
import json
import sys
sys.path.insert(0, 'apps/api/src/modules/python/scripts')

# 模拟命令行参数
sys.argv = ['interpolation.py', json.dumps({
    'input_file': 'test_data.txt',
    'value_threshold': 50.0,
    'geojson_file': 'data/domain_xinyu_20250729_093415.geojson',
    'max_points': 1000
})]

from interpolation import main
main()
```

## 测试数据格式

创建 `test_data.txt` 文件（制表符分隔，无表头）：

```
3562647.86574855	2076953.23932178	2.4
4439897.85055016	3847618.21344455	0.0
4421927.02143045	2589031.26428981	0.0
```

## 查看输出

脚本会输出JSON格式的结果到stdout，错误和进度信息到stderr：

```json
{
  "success": true,
  "summary": {
    "total_points": 5,
    "value_threshold": 50.0,
    "coordinate_transform": true,
    "geojson_filtered": true
  },
  "points": [
    {
      "longitude": 5.1234,
      "latitude": 45.5678,
      "value": 2.4
    }
  ]
}
```

## 调试技巧

1. **查看进度信息**：所有进度输出到stderr，使用 `2>&1` 查看：
   ```bash
   python interpolation.py $args 2>&1
   ```

2. **保存输出到文件**：
   ```bash
   python interpolation.py $args > output.json 2> progress.log
   ```

3. **检查Python环境**：
   ```bash
   python --version
   python -c "import geopandas; print('geopandas OK')"
   ```



