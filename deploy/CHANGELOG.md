# Changelog

## 1.0.1 - 2025-01-13

### ✨ 新增功能
- **前端重构**：将 `index.html` 从 1694 行重构为模块化结构
  - 创建 `frontend/` 目录，按功能拆分代码
  - CSS 提取到独立文件（`frontend/css/main.css`, `frontend/css/map.css`）
  - JavaScript 模块化：工具函数、统计数据、搜索、事件管理、地图、插值分析、数据管理
  - 主 HTML 文件精简至约 181 行（仅保留结构）
  - 保持零构建，使用原生 JavaScript
- **静态文件服务**：Express 服务器配置静态文件中间件，支持 `frontend/` 目录
  - 自动设置正确的 MIME 类型（CSS: text/css, JS: application/javascript）
- **Python 空间插值分析模块**：完整的 Python 集成，支持地理空间数据处理
  - 嵌入式 Python 环境（Python 3.12）
  - 文件上传功能（支持 CSV/TXT，制表符分隔）
  - 自动坐标转换（EPSG:3035 → WGS84）
  - 阈值筛选（固定阈值 50.0，只显示值大于 50 的点）
  - GeoJSON 空间筛选（基于多边形区域）
  - 每区域最大值点选择（每个多边形区域只保留最大值点）
  - 地图可视化集成（Leaflet.js，自动显示 GeoJSON 底图和数据点）
  - 完整的错误处理和超时机制

### 🛠️ 技术改进
- **前端模块化重构**：
  - 代码组织更清晰，每个模块职责单一
  - 全局变量管理：地图相关变量通过 `window` 对象共享
  - 模块间通信：通过全局函数和事件机制
  - 易于扩展：新增功能只需添加新模块
- Python 脚本执行器优化：批量坐标转换，提升性能
- 前端错误处理增强：详细的错误提示和解决建议
- 测试脚本支持：`test_interpolation.py` 和 `run_test.bat` 用于本地测试
- 文件读取优化：自动检测表头、支持多种分隔符

### 📝 文档更新
- 更新 README.md：添加 Python 模块使用说明
- 更新 CODE_TREE.md：添加 Python 模块结构说明
- 添加测试文档：`README_TESTING.md`

### 🐛 问题修复
- 修复 JSON 序列化错误（布尔值处理）
- 修复坐标转换性能问题（改为批量转换）
- 修复文件读取逻辑（优先使用制表符分隔）
- 修复前端错误提示（更详细的错误信息和解决建议）

## 1.0.0 - 2025-11-05
- 本地端到端跑通：采集（多源）→ 处理 → 分析 → 搜索/导出
- 新增去重 `record_id`、置信度 `confidence`、证据数 `evidence_count`、来源信息
- 搜索接口支持 `country/date/severity/q`，q 为空返回最新 50 条
- 前端 `index.html` 对接本地 API，展示置信度/来源/证据数
- 导出 CSV 包含来源、置信度、证据数与坐标等字段
- 提供 `deploy/local/run_e2e.bat` 一键脚本


