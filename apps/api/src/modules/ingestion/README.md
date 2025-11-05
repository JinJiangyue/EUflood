# ingestion 模块

- 职责：从外部数据源采集洪水相关数据，写入数据库。
- 形态：可被路由触发或定时任务触发（node-cron/BullMQ）。
- 建议文件：
  - `service.ts`：采集逻辑（抓取、解析、校验、入库）
  - `routes.ts`：如需提供手动触发入口
  - `tasks.ts`：定时任务入口

