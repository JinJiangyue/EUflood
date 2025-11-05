# EUflood v1.0.0（本地开发版）

洪水数据采集 → 处理 → 分析 → 搜索/导出，全流程本地可运行方案。

## 特性
- Node.js + TypeScript + Express
- 本地数据库：SQLite（better-sqlite3）
- 多源采集（官方API/社媒/新闻，模拟）：去重（record_id）、置信度、证据链
- 数据处理：risk_score/status/processed_at
- 搜索接口：支持参数 country/date/severity 与关键词 q（可为空）
- 分析接口：总量/处理数/平均风险/最大水位
- 导出：CSV（包含来源、置信度、证据数）
- 前端：根目录 `index.html` 纯静态页，直连本地 API
- 一键打通：`deploy/local/run_e2e.bat`

## 快速开始（Windows）
```
cd E:\\Project\\europe\\apps\\api
npm install
echo PORT=3000> .env & echo DB_FILE=./dev.db>> .env & echo LOG_LEVEL=info>> .env
npm run dev
```
- 首页: http://localhost:3000/
- 健康: http://localhost:3000/health
- 搜索: http://localhost:3000/search
- 分析: http://localhost:3000/analysis/summary
- 导出: http://localhost:3000/export

## 代码结构
- 见 `CODE_TREE.md`

## 数据库位置
- 默认：`apps/api/dev.db`
- 可配：`apps/api/.env` 中 `DB_FILE`

## 部署与远程
- 远程仓库已配置为 `git@github.com:JinJiangyue/EUflood.git`（未推送）
- 生产建议：Postgres + Docker；当前仓库用于本地迭代与验证

