# 技术栈说明（本地开发：无 Docker，SQLite）

## 目标
- 在 Windows 本地快速启动与调试 API 服务；后续可平滑迁移到 Docker + Postgres 进行部署。

## 运行时与语言
- Node.js 20+
- TypeScript（编译为 CommonJS）

## 核心依赖
- express：HTTP 服务与路由
- better-sqlite3：本地数据库（SQLite），零运维、单文件存储
- zod：入参校验
- dotenv：环境变量加载
- pino：结构化日志
- nodemon、ts-node、typescript：本地开发与构建

## 目录结构
```
apps/api/
  package.json         # 脚本与依赖
  tsconfig.json        # TS 配置
  src/
    index.ts           # 应用入口
    db.ts              # SQLite 连接与初始化
    routes/
      index.ts         # 路由注册
      search.ts        # 示例：/health、/search、/records
```

## 环境变量
- PORT：服务端口，默认 3000
- DB_FILE：SQLite 文件路径，默认 ./dev.db（相对 apps/api）
- LOG_LEVEL：日志级别，默认 info

示例 `.env`：
```
PORT=3000
DB_FILE=./dev.db
LOG_LEVEL=info
```

## 启动与验证（Windows）
```
cd E:\\Project\\europe\\apps\\api
npm install
npm run dev
```
- 健康检查：GET http://localhost:3000/health
- 新增记录：POST http://localhost:3000/records { description, water_level? }
- 搜索：GET http://localhost:3000/search?q=keyword

## 数据库（开发期）
- SQLite：better-sqlite3 同步 API，首次启动自动建表（见 `src/db.ts`）。
- 表：`flood_records(id, description, water_level, created_at)`，仅示例用途，可按业务扩展。

## 日志
- pino 输出到 stdout，级别由 `LOG_LEVEL` 控制。

## 校验
- zod 对 query/body 做最小校验，返回 400 + 错误详情。

## 构建与运行（生产二选一，仅指引）
1) 继续 SQLite（不推荐生产）：
   - 直接 `npm run build && node dist/index.js`
2) 迁移到 Docker + Postgres（推荐）：
   - 抽象数据访问层或替换为 ORM（Prisma/Drizzle），将 SQLite 语法差异收敛。
   - 使用 `Dockerfile` 构建镜像，`DATABASE_URL` 指向 Postgres。

## 从 SQLite 迁移到 Postgres 的建议
- 保持 SQL 尽量标准化（避免 SQLite 方言，如 datetime('now')）。
- 在 CI 中增加 Postgres 服务，跑一次端到端或集成测试验证兼容性。
- 逐步替换 `better-sqlite3` 访问为 ORM 或 `pg` 驱动实现。

## 安全与鉴权（后续）
- 当前示例路由无鉴权，仅用于本地调试。
- 上线前引入 JWT/OAuth（Auth.js/Clerk/自建）并加上速率限制与 CORS 配置。

## 监控与可观测（后续）
- 接入基础指标（/metrics + Prometheus）与结构化日志聚合（ELK/ClickHouse）。

## 约定
- 仅通过 `process.env.*` 读取配置，避免将环境耦合到代码。
- 路由与服务逻辑分层，避免直接在路由中写复杂业务。


