# Changelog

## 1.0.0 - 2025-11-05
- 本地端到端跑通：采集（多源）→ 处理 → 分析 → 搜索/导出
- 新增去重 `record_id`、置信度 `confidence`、证据数 `evidence_count`、来源信息
- 搜索接口支持 `country/date/severity/q`，q 为空返回最新 50 条
- 前端 `index.html` 对接本地 API，展示置信度/来源/证据数
- 导出 CSV 包含来源、置信度、证据数与坐标等字段
- 提供 `deploy/local/run_e2e.bat` 一键脚本


