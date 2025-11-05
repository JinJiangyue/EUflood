# 架构与代码组织

## 目标
- 模块化、可扩展，方便将来从本地 SQLite 迁移到 Postgres + Docker。

## 顶层结构
```
src/
  index.ts                 # 应用入口
  db.ts                    # 本地 SQLite 连接与初始化
  routes/
    index.ts               # 汇总注册（可逐步迁移到模块内）
  modules/
    search/                # 搜索与样例写入
      routes.ts
    ingestion/             # 数据采集
      README.md
    processing/            # 数据处理
      README.md
    analysis/              # 影响评估
      README.md
    exporting/             # 数据导出
      README.md
```

## 模块职责边界
- ingestion：从外部源拉取→校验→入库
- processing：对原始数据做清洗/聚合/打标→写回
- analysis：影响/风险分析，暴露分析 API 或服务
- search：查询接口（关键词/语义）与统计
- exporting：导出文件/流

## 路由注册策略
- 每个模块暴露 `registerXXXModule(app)`，在 `routes/index.ts` 中集中注册。
- 后续也可改为自动扫描 `modules/*/routes.ts` 动态加载。

## 数据访问与迁移
- 现阶段：`db.ts` 使用 better-sqlite3。
- 迁移方案：
  - 提取 Repository 层（模块内 `repo.ts`），统一读写接口；
  - 切换实现到 `pg`/ORM（Prisma/Drizzle），最小化对上层的影响。

## 任务与调度
- 定时任务可在各模块提供 `tasks.ts`；统一由 `jobs/index.ts` 调度。
- 需要重试/并行时，引入队列（BullMQ），部署时拆分为独立 worker 容器。

## 规范
- 类型：Zod 校验接口入参；TS 强类型覆盖内部数据结构。
- 配置：仅从 `process.env` 读取；开发 `.env`，生产环境变量注入。
- 日志：Pino，结构化输出，按模块打 tag。


