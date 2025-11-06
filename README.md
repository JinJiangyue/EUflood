# EUflood v1.0.2（本地开发版）

洪水数据采集 → 处理 → 分析 → 搜索/导出 → **空间插值分析**，全流程本地可运行方案。

## 特性
- Node.js + TypeScript + Express
- 本地数据库：SQLite（better-sqlite3）
- 多源采集（官方API/社媒/新闻，模拟）：去重（record_id）、置信度、证据链
- 数据处理：risk_score/status/processed_at
- 搜索接口：支持参数 country/date/severity 与关键词 q（可为空）
- 分析接口：总量/处理数/平均风险/最大水位
- 导出：CSV（包含来源、置信度、证据数）
- **Python 空间插值分析模块**：支持坐标转换、GeoJSON 筛选、阈值过滤、地图可视化
- 前端：根目录 `index.html` 纯静态页，直连本地 API，集成 Leaflet 地图

## 快速开始（Windows）

### 1. 安装依赖
```bash
cd apps/api
npm install
echo PORT=3000> .env & echo DB_FILE=./dev.db>> .env & echo LOG_LEVEL=info>> .env
```

### 2. 配置 Python 环境（空间插值分析需要）
```bash
# 检查嵌入式 Python 是否已安装
cd apps/api
python-embed\python.exe --version

# 安装 Python 依赖
cd python-embed\Scripts
pip.exe install -r ..\..\src\modules\python\scripts\requirements.txt
```

### 3. 启动服务
```bash
npm run dev
```

### 4. 访问应用
- 首页: http://localhost:3000/
- 健康检查: http://localhost:3000/health
- Python 健康检查: http://localhost:3000/python/health
- 搜索: http://localhost:3000/search
- 分析: http://localhost:3000/analysis/summary
- 导出: http://localhost:3000/export

## 核心功能模块

### 1. 数据采集模块 (`modules/ingestion`)
- 多源数据采集（官方API/社交媒体/新闻）
- 自动去重（基于 `record_id`）
- 置信度评分
- 证据链管理

### 2. 数据处理模块 (`modules/processing`)
- 风险评分计算
- 状态更新
- 处理时间记录

### 3. 分析模块 (`modules/analysis`)
- 数据统计摘要
- 平均风险值计算
- 最大水位追踪

### 4. 搜索模块 (`modules/search`)
- 多条件搜索（国家/日期/严重程度）
- 关键词搜索
- 默认返回最新 50 条

### 5. 导出模块 (`modules/exporting`)
- CSV 格式导出
- 包含来源、置信度、证据数等完整信息

### 6. Python 空间插值分析模块 (`modules/python`) ⭐ 增强
- **文件上传**：支持 CSV/TXT 格式数据文件
- **坐标转换**：自动检测 EPSG:3035 坐标并转换为 WGS84（经纬度）
- **阈值筛选**：可配置阈值（默认 50.0，前端可修改）
- **GeoJSON 空间筛选**：基于域 GeoJSON 区域进行空间筛选
- **行政区解析**：
  - 从域 GeoJSON 解析国家代码（CNTR_CODE）和省名（NUTS_NAME/NAME）
  - 从 LAU_2019.gpkg 获取城市名（LAU_NAME）
- **每区域最大值**：每个多边形区域只保留最大值点
- **地图可视化**：前端集成 Leaflet.js，自动显示 GeoJSON 底图和数据点
- **地点列表**：地图下方显示国家/省/市列表（按唯一组合统计）
- **测试脚本**：提供 `test_interpolation.py` 和 `run_test.bat` 用于本地测试

#### Python 模块使用示例

**前端使用**：
1. 上传数据文件（制表符分隔：X坐标、Y坐标、值）
2. 点击"运行空间插值"按钮
3. 地图自动显示处理后的数据点

**命令行测试**：
```bash
cd apps/api/src/modules/python/scripts
python-embed\python.exe test_interpolation.py
```

## 代码结构
- 见 `CODE_TREE.md`

## 数据库位置
- 默认：`apps/api/dev.db`
- 可配：`apps/api/.env` 中 `DB_FILE`

## 技术栈

### 后端
- **运行时**：Node.js + TypeScript
- **框架**：Express.js
- **数据库**：SQLite (better-sqlite3)
- **Python 集成**：嵌入式 Python 3.12 + 科学计算库（pandas, geopandas, pyproj）

### 前端
- **框架**：原生 HTML + JavaScript（零构建）
- **架构**：模块化设计，按功能拆分（stats, search, events, map, interpolation, data-management）
- **地图库**：Leaflet.js
- **样式**：独立的 CSS 文件（main.css, map.css）
- **文件结构**：`frontend/` 目录包含所有前端资源

### Python 依赖
- pandas: 数据处理
- geopandas: 地理空间数据处理
- pyproj: 坐标系统转换
- shapely: 几何操作
- geopy: 地理编码（可选）

## 部署与远程
- 远程仓库已配置为 `git@github.com:JinJiangyue/EUflood.git`（未推送）
- 生产建议：Postgres + Docker；当前仓库用于本地迭代与验证

## 版本历史
- **v1.0.2** (最新): 空间插值分析增强，支持行政区解析（国家/省/市）、阈值可配置、地点列表显示
- **v1.0.1**: 新增 Python 空间插值分析模块，支持坐标转换、GeoJSON 筛选、地图可视化
- **v1.0.0**: 基础功能实现，数据采集、处理、分析、搜索、导出

详见 `CHANGELOG.md`
