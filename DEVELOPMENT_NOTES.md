# Development Notes

## 1.0.0 - 2025-11-05（新增条目，旧内容保留在本条目下方）
- 后端 TS、前端原生 JS：后端有编译链路利于可维护性；前端为零构建即用。
- SQLite 开发策略：用 better-sqlite3（同步、稳定）；通过 PRAGMA 检测列并在线升级，兼容旧库。
- 多源采集：将不同来源差异抽象为记录生成器；统一字段后用 `record_id` 去重，合并证据数与置信度。
- 置信度模型：源头权重 + 字段完整度 + 多源一致度（上限 0.95）；合并时取更高值。
- 地理编码：先内置映射模拟；后续可替换为 Nominatim/Google Geocoding。
- 搜索：从拼关键词改为结构化参数（country/date/severity），q 仍可选。
- 首页直连 API：避免前后端耦合复杂度，先保障可视化验证。
- 迁移策略：将 Postgres 迁移 SQL 留在 `apps/api/sql/migrations` 供未来迁移参考。


