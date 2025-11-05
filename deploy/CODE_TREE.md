# 代码结构解析（v1.0.0）

根目录
- README.md             项目说明与快速开始
- CODE_TREE.md          代码结构解析（本文）
- TECH_STACK.md         技术栈说明
- ARCHITECTURE.md       架构与模块职责
- deploy/local/         本地一键打通脚本与文档
- apps/api/             本地 API（Node.js + TypeScript + SQLite）

apps/api
- package.json          脚本与依赖
- tsconfig.json         TypeScript 配置
- .env                  开发环境变量（示例：PORT/DB_FILE/LOG_LEVEL）
- dev.db                本地 SQLite 数据库（git 忽略）
- src/
  - index.ts            应用入口，注册所有路由；/ 返回根 index.html
  - db.ts               SQLite 连接、初始化与列升级
  - routes/
    - index.ts          汇总注册各模块路由
  - modules/
    - search/
      - routes.ts       搜索接口
        - GET /search?q&country&date&severity
          - 支持结构化过滤；为空时返回最近 50 条
    - ingestion/
      - service.ts      多源采集（官方API/社媒/新闻）+ 去重 + 置信度
      - routes.ts       POST /ingestion/run {count?}
      - tasks.ts        示例定时任务（可选）
      - utils.ts        geocode、recordId、confidence、severity 推断
    - processing/
      - service.ts      处理新记录（risk_score/status/processed_at）
      - routes.ts       POST /processing/run
    - analysis/
      - routes.ts       GET /analysis/summary（总数/处理数/均值/最大水位）
    - exporting/
      - routes.ts       GET /export（CSV，包含来源/置信度/证据数）
- sql/migrations/       参考的 Postgres 迁移 SQL（非 SQLite 直接执行）

前端（根 index.html）
- 纯 HTML+原生 JS 页面
- 顶部统计卡片通过 /analysis/summary 加载
- 搜索表单使用 country/date/severity 参数调用 /search
- 提供按钮：采集、处理、刷新统计、导出 CSV

deploy/local
- run_e2e.bat           一键：安装依赖→启动服务→健康检查→采集→处理→分析→导出
- README.md             使用说明

数据与模型要点
- SQLite 表：flood_records
  - 关键字段：record_id（去重）、country、specific_location、event_time、coordinates
  - 来源与质量：source_type/name/url、confidence、evidence_count、metadata
  - 处理字段：status、risk_score、processed_at


