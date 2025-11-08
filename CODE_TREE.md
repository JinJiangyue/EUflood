# 代码结构解析（v1.0.5）

## 根目录结构

```
europe/
├── README.md                   项目说明与快速开始
├── CODE_TREE.md               代码结构解析（本文）
├── CHANGELOG.md               版本变更记录
├── DEVELOPMENT_NOTES.md       开发经验总结
├── index.html                 前端主页面（精简版，约181行）
├── frontend/                  前端资源目录（v1.0.1 重构后）
│   ├── css/                  样式文件
│   │   ├── main.css          主样式
│   │   └── map.css           地图样式
│   └── js/                   JavaScript 模块
│       ├── i18n.js           国际化模块（多语言支持）⭐ v1.0.5
│       ├── i18n/             语言包目录 ⭐ v1.0.5
│       │   ├── zh.json       中文翻译
│       │   ├── en.json       英文翻译
│       │   └── es.json       西班牙语翻译
│       ├── utils.js          工具函数
│       ├── main.js           主入口
│       └── modules/           功能模块
├── apps/
│   └── api/                    本地 API（Node.js + TypeScript + SQLite）
│       ├── package.json        脚本与依赖
│       ├── tsconfig.json       TypeScript 配置
│       ├── .env                开发环境变量（PORT/DB_FILE/LOG_LEVEL/PYTHON_PATH等）
│       ├── database/            数据库目录（统一位置）⭐ v1.0.5
│       │   └── dev.db           本地 SQLite 数据库（git 忽略）
│       ├── python-embed/       嵌入式 Python 3.12 环境
│       ├── uploads/            上传文件目录（git 忽略）
│       │   ├── rain_file/      降雨数据文件 ⭐ v1.0.5
│       │   └── geofile/        地理数据文件 ⭐ v1.0.5
│       │       ├── nuts3/       NUTS3 GeoJSON 文件
│       │       └── city/        City GPKG 文件
│       ├── scripts/             Python 脚本目录（从 src/modules/python 移动）⭐ v1.0.5
│       │   ├── deep_search.py  深度搜索主脚本
│       │   ├── interpolation.py 空间插值分析脚本
│       │   └── bat_python/    批处理脚本和缓存文件
│       ├── src/
│       │   ├── index.ts         应用入口，注册所有路由；/ 返回根 index.html
│       │   ├── db.ts           SQLite 连接、初始化与列升级
│       │   ├── routes/
│       │   │   └── index.ts     汇总注册各模块路由
│       │   └── modules/        功能模块
│       └── sql/
│           └── migrations/     参考的 Postgres 迁移 SQL（非 SQLite 直接执行）
└── deploy/
    └── local/                  本地一键打通脚本与文档
```

## apps/api/src 详细结构

### 核心文件
- `index.ts`: Express 应用入口，注册所有路由模块，根路径返回 `index.html`
  - 配置静态文件服务：`/frontend` 路径提供 `frontend/` 目录下的静态资源
  - 自动设置 MIME 类型（CSS、JS）
- `db.ts`: SQLite 数据库连接和初始化，支持列升级

### 路由注册 (`routes/index.ts`)
汇总注册所有模块路由：
- `registerSearchModule`
- `registerIngestionModule`
- `registerProcessingModule`
- `registerAnalysisModule`
- `registerExportingModule`
- `registerTriggerModule`
- `registerEventsModule`
- `registerMergerModule`
- `registerPythonModule` ⭐ 新增

### 功能模块 (`modules/`)

#### 1. 搜索模块 (`search/`)
- `routes.ts`: 
  - `GET /search?q&country&date&severity`
  - 支持结构化过滤；为空时返回最近 50 条

#### 2. 数据采集模块 (`ingestion/`)
- `service.ts`: 多源采集（官方API/社媒/新闻）+ 去重 + 置信度
- `routes.ts`: `POST /ingestion/run {count?}`
- `tasks.ts`: 示例定时任务（可选）
- `utils.ts`: geocode、recordId、confidence、severity 推断

#### 3. 数据处理模块 (`processing/`)
- `service.ts`: 处理新记录（risk_score/status/processed_at）
- `routes.ts`: `POST /processing/run`

#### 4. 分析模块 (`analysis/`)
- `routes.ts`: `GET /analysis/summary`（总数/处理数/均值/最大水位）

#### 5. 导出模块 (`exporting/`)
- `routes.ts`: `GET /export`（CSV，包含来源/置信度/证据数）

#### 6. Python 脚本模块 (`scripts/`) ⭐ v1.0.5 重构

**位置变更**：从 `src/modules/python/scripts/` 移动到 `apps/api/scripts/`

**核心文件**（位于 `apps/api/scripts/`）：
- `config.ts`: Python 路径配置、脚本目录、上传目录、地理数据目录
- `routes.ts`: Python 模块路由注册
  - `GET /python/runtime`: 获取运行环境信息
  - `GET /python/health`: 检查 Python 是否可用
  - `POST /python/upload`: 文件上传接口
  - `POST /python/interpolation`: 空间插值分析接口
  - `GET /python/geojson/:filename`: 获取 GeoJSON 文件
  - `GET /python/debug/paths`: 调试路径信息 ⭐ v1.0.5

**Python 脚本**：
- `deep_search.py`: 深度搜索主脚本（从 `search/test_search.py` 重命名并移动）⭐ v1.0.5
  - 支持 `--json` 参数：从 JSON 文件读取事件数据
  - 支持 `--event-id` 参数：从数据库读取事件数据
  - 调用搜索管线工作流，生成表2数据和报告
- `interpolation.py`: 空间插值分析主脚本
  - 自动检测坐标列（支持无表头）
  - EPSG:3035 → WGS84 坐标转换
  - 阈值筛选（可配置，默认 50.0）
  - GeoJSON 空间筛选（域多边形）
  - 从域 GeoJSON 解析国家/省（CNTR_CODE/NUTS_NAME/NAME）
  - 从 LAU_2019.gpkg 获取城市（LAU_NAME）
  - 每区域最大值点选择
- `bat_python/`: 批处理脚本和缓存文件（.bat, .sh, .ps1, .js, __pycache__）⭐ v1.0.5

**数据目录**（统一位置）⭐ v1.0.5：
- `apps/uploads/rain_file/`: 用户上传的降雨数据文件
- `apps/uploads/geofile/nuts3/`: NUTS3 GeoJSON 文件
- `apps/uploads/geofile/city/`: City GPKG 文件（LAU_2019.gpkg）

#### 7. 触发模块 (`trigger/`)
- `config.ts`: 配置管理
- `routes.ts`: 触发相关路由
- `service.ts`: 触发服务
- `tasks.ts`: 定时任务

#### 8. 事件模块 (`events/`)
- `collectors/`: 数据收集器
  - `efas.ts`: EFAS 数据收集
  - `gdacs.ts`: GDACS 数据收集
  - `meteoalarm.ts`: MeteoAlarm 数据收集
  - `open-meteo.ts`: Open-Meteo 数据收集
- `enrich.ts`: 事件增强
- `matching.ts`: 事件匹配
- `merger.ts`: 事件合并
- `merger-routes.ts`: 合并路由
- `rain-routes.ts`: 降雨事件路由 ⭐ v1.0.5 新增
  - `GET /events/rain`: 查询降雨事件（支持日期范围和国家筛选）
  - `GET /events/rain/:id`: 获取事件详情（根据搜索状态返回表1或表2数据）
  - `POST /events/rain/:id/deep-search`: 触发深度搜索
- `service.ts`: 事件服务

## 前端 (`index.html` 与 `frontend/` 目录)

### 文件结构（v1.0.5 更新）
```
frontend/
├── css/
│   ├── main.css         主样式（约365行）
│   └── map.css          地图相关样式（NUTS工具提示等）
├── js/
│   ├── i18n.js          国际化模块（多语言支持）⭐ v1.0.5 新增
│   ├── i18n/            语言包目录 ⭐ v1.0.5 新增
│   │   ├── zh.json      中文翻译
│   │   ├── en.json      英文翻译
│   │   └── es.json      西班牙语翻译
│   ├── utils.js         工具函数（escapeHtml, formatDate, displayResults等）
│   ├── main.js          主入口文件（初始化所有模块）
│   └── modules/
│       ├── stats.js             统计数据加载
│       ├── search.js            搜索功能
│       ├── events.js            事件管理（查询、详情、深度搜索）⭐ v1.0.5 增强
│       ├── map.js               地图管理（初始化、GeoJSON、数据点）
│       ├── interpolation.js     空间插值分析（文件上传、处理）
│       └── data-management.js   数据管理（触发器、采集、处理）
└── index.html           精简后的主HTML（约200行，包含data-i18n属性）⭐ v1.0.5 更新
```

### 主要功能
- **模块化设计**：按功能拆分为独立模块，易于维护和扩展
- **零构建**：使用原生 JavaScript，无需构建工具
- **静态文件服务**：通过 Express 静态文件中间件提供 CSS/JS
- 顶部统计卡片通过 `/analysis/summary` 加载
- 搜索表单使用 `country/date/severity` 参数调用 `/search`
- 提供按钮：采集、处理、刷新统计、导出 CSV
- **空间插值分析界面**：
  - 文件上传功能
  - 阈值可配置（默认 50.0，可修改）
  - Leaflet 地图集成
  - 自动加载 GeoJSON 底图
  - 数据点可视化（基于阈值着色）
  - 地点列表显示（国家/省/市，按唯一组合统计）
  - 错误处理和超时处理

### 地图功能
- 使用 Leaflet.js 库
- 自动初始化地图容器
- 加载默认 GeoJSON 区域
- 显示数据点（圆形标记）
- 根据值大小着色（红色=高值，橙色=中值）
- 点击标记显示详细信息（经纬度、值）
- NUTS 区域信息显示（鼠标悬停和点击）

### 模块说明
- **i18n.js**：国际化模块 ⭐ v1.0.5 新增
  - 从独立 JSON 文件加载翻译数据（zh.json, en.json, es.json）
  - 提供 `t()` 函数获取翻译文本
  - 提供 `setLanguage()` 函数切换语言
  - 自动更新页面上的所有 `data-i18n` 元素
  - 语言选择保存到 localStorage
  - 语言切换器 UI（右上角按钮）
- **stats.js**：统计数据加载和显示
- **search.js**：搜索表单处理和结果展示
- **events.js**：事件查询、候选列表、详情展示、深度搜索功能 ⭐ v1.0.5 增强
  - 支持表1/表2数据条件显示
  - 深度搜索按钮和确认对话框
  - 深度搜索进度显示和错误处理
  - 超时处理（4分钟）
- **map.js**：地图初始化、GeoJSON 加载、数据点标记管理
- **interpolation.js**：文件上传、API 调用、结果展示
- **data-management.js**：触发器检查、数据采集、处理、刷新统计
- **utils.js**：通用工具函数（HTML 转义、日期格式化、结果展示等）

## 数据与模型

### SQLite 数据库位置
- **统一路径**：`apps/database/dev.db`（v1.0.5 统一）
- **配置方式**：通过 `.env` 文件中的 `DB_FILE` 环境变量配置（支持相对路径）

### SQLite 表：`flood_records`
- **关键字段**：`record_id`（去重）、`country`、`specific_location`、`event_time`、`coordinates`
- **来源与质量**：`source_type/name/url`、`confidence`、`evidence_count`、`metadata`
- **处理字段**：`status`、`risk_score`、`processed_at`

### SQLite 表：`rain_event`（表1）⭐ v1.0.5
- **主键**：`id`（格式：`YYYYMMDD_Province_seq`，如 `20251011_Valencia_1`）
- **关键字段**：`date`、`country`、`province`（保留空格，不替换为下划线）、`city`、`longitude`、`latitude`、`value`、`threshold`、`file_name`、`seq`、`searched`（0=未搜索，1=已搜索）
- **用途**：存储从空间插值分析导入的降雨事件数据

### SQLite 表：`rain_flood_impact`（表2）⭐ v1.0.5
- **主键**：`id`（自增）
- **外键**：`rain_event_id`（直接复制自表1的 `id`，确保完全匹配）
- **关键字段**：`time`（直接复制自表1的 `date`）、`level`、`country`、`province`、`city`、`transport_impact_level`、`economy_impact_level`、`safety_impact_level`、`timeline_data`（JSON）、`source_count`、`detail_file`（报告路径：`search_outputs/YYYYMMDD/完整ID_report.md`）
- **用途**：存储深度搜索生成的影响评估数据

### Python 脚本输入输出

**输入格式**（制表符分隔）：
```
X坐标        Y坐标        值
3562647.86  2076953.23  2.4
4439897.85  3847618.21  0.0
```

**输出格式**（JSON）：
```json
{
  "success": true,
  "summary": {
    "total_points": 8,
    "value_threshold": 50.0,
    "coordinate_transform": true,
    "geojson_filtered": true,
    "lau_join": true
  },
  "points": [
    {
      "longitude": -0.4459,
      "latitude": 39.1134,
      "value": 102.0,
      "country_code": "ES",
      "country_name": "Spain",
      "province_name": "Valencia/València",
      "city_name": "Carcaixent"
    }
  ]
}
```

## 搜索管线模块 (`search/`) ⭐ v1.0.4 新增

### 核心架构
- **LLM 驱动处理**：完全使用大语言模型（OpenAI GPT / Google Gemini）进行信息验证、提取和报告生成
- **多语言支持**：自动识别国家官方语言，使用本地语言进行搜索，最终输出英文报告
- **模块化设计**：参考 BettaFish 的 Agent 架构，按功能拆分为独立模块

### 目录结构
```
search/
├── config/                   配置管理
│   ├── settings.py           全局配置（数据库、API密钥、LLM设置等）
│   └── terminology.json      国家与官方语言术语表
├── geolingua/                 地理与语言解析
│   └── resolver.py           根据地点识别国家和官方语言
├── query/                     查询规划
│   ├── channels.py           搜索渠道配置
│   └── keyword_planner.py    多语言关键词生成（省级优先、自然语言查询）
├── collectors/                数据采集器（模块化、可配置）
│   ├── collector_config.json 采集器配置（启用/禁用）
│   ├── loader.py             动态加载采集器
│   ├── base.py               采集器基类
│   ├── news/                 新闻采集器
│   │   ├── thenewsapi.py     The News API（支持历史数据）
│   │   ├── gnews.py          GNews API（备选）
│   │   └── serpapi.py        SerpAPI（备选）
│   ├── officials/            官方来源采集器
│   │   └── tavily.py         Tavily API（政府/气象网站）
│   ├── medias/               多媒体采集器
│   │   └── youtube.py        YouTube Data API
│   └── socials/              社交媒体采集器
│       ├── x_twitter.py      X (Twitter) API
│       └── instagram.py      Instagram Graph API
├── llm/                       LLM 处理模块
│   ├── client.py              LLM 客户端抽象（OpenAI / Gemini）
│   ├── processor.py           4 步处理流程
│   └── prompts.py             Prompt 模板
├── orchestrator/              流程编排
│   └── workflow.py            主工作流（采集→处理→报告）
├── utils/                     工具函数
│   └── detailed_logger.py     详细日志记录（保存到 test_log.md）
├── watcher/                   事件监控
│   └── rain_event_watcher.py  从数据库读取降雨事件
├── knowledge/                 知识存储
│   └── state_store.py        状态存储（未来扩展）
├── test_search.py            测试脚本
├── test_api_keys.py          API 密钥测试
├── requirements.txt           Python 依赖
├── README.md                  项目说明
├── INSTALL.md                 安装指南
├── TEST.md                    测试指南
└── CONFIGURATION_GUIDE.md     配置指南
```

### 处理流程

#### 1. 事件识别与地理解析
- **输入**：`rain_events` 表中的降雨事件（时间、地点、降雨量）
- **处理**：`GeoLinguaResolver` 识别国家和官方语言
- **输出**：国家代码、官方语言、本地术语（rain/flood 的翻译）

#### 2. 关键词规划
- **处理**：`KeywordPlanner` 生成多语言关键词
  - 地点策略：省级优先（忽略具体雨量站城市）
  - 时间格式：自然语言（如 "October 11, 2025"）
  - 查询字符串：去重、自然语言组合
- **输出**：多语言关键词包和查询字符串

#### 3. 数据采集
- **采集器**：根据 `collector_config.json` 动态加载
  - 官方来源：Tavily（政府/气象网站）
  - 新闻：The News API（支持历史数据）
  - 多媒体：YouTube（视频）
  - 社交媒体：X/Instagram（可选，当前禁用）
- **时间过滤**：统一使用 `NEWS_SEARCH_WINDOW_DAYS` 配置（默认 3 天）
- **输出**：原始搜索结果（标题、摘要、URL、发布时间等）

#### 4. 预过滤（可选）
- **目的**：在交给 LLM 前进行简单规则判断，减少 token 消耗
- **检查项**：
  - 时间匹配：从 URL/文本提取日期，只保留事件时间 + N 天内的结果
  - 地点匹配：标题/摘要包含省名或国家名
  - 关键词匹配：包含 rain/flood 等关键词
- **模式**：strict（严格，必须同时满足）或 loose（宽松，满足任意一个）

#### 5. LLM 处理（4 个步骤）

**步骤 1：事件验证和冲突解决**
- 判断搜索结果是否属于该特定事件
- 验证信息准确性，解决冲突
- 输出：相关项、不相关项（含排除原因）、已验证事实、冲突信息

**步骤 2：时间线和影响提取**
- 从验证后的信息中提取详细时间线
- 提取影响评估（交通、经济、安全、应急响应）
- 输出：时间段事件列表、量化数据

**步骤 3：多媒体筛选**
- 从视频/多媒体内容中选择最相关、最有价值的 5-10 条
- 输出：选中的多媒体项、被拒绝的项

**步骤 4：报告生成**
- 根据所有处理结果生成完整的英文洪水事件报告
- 包含：事件概述、洪水时间线、多媒体与新闻来源、影响评估、总结

#### 6. 报告输出
- **格式**：Markdown
- **语言**：英文
- **保存位置**：`search_outputs/{event_id}_report.md`
- **中间结果**：同时保存原始结果、预过滤结果、LLM 验证结果

### 配置项（`.env` 文件）

#### LLM 配置
- `LLM_PROVIDER`: openai 或 gemini
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: API 密钥
- `OPENAI_MODEL` / `GEMINI_MODEL`: 模型名称
- `LLM_TEMPERATURE`: 温度参数（默认 0.3）
- `LLM_MAX_TOKENS`: 最大输出 token（默认 8000）

#### 搜索配置
- `NEWS_SEARCH_WINDOW_DAYS`: 新闻搜索时间窗口（默认 3 天）
- `LLM_VALIDATION_TIME_WINDOW_DAYS`: LLM 验证时间窗口（默认 5 天）

#### 预过滤配置
- `PRE_FILTER_ENABLED`: 是否启用预过滤（默认 true）
- `PRE_FILTER_MODE`: strict 或 loose（默认 strict）
- `PRE_FILTER_TIME_WINDOW_DAYS`: 预过滤时间窗口（默认 3 天）
- `MAX_ITEMS_FOR_LLM_VALIDATION`: 交给 LLM 验证的最大数量（默认 10）

#### API 密钥
- `TAVILY_API_KEY`: Tavily 搜索 API
- `THENEWSAPI_KEY`: The News API
- `YOUTUBE_API_KEY`: YouTube Data API

### 关键特性

1. **智能日期提取**：从 URL 和文本中自动提取日期，提高预过滤准确性
2. **详细日志**：所有处理步骤的详细日志保存到 `test_log.md`
3. **中间结果保存**：保存原始结果、预过滤结果、LLM 验证结果到独立文件
4. **成本优化**：
   - 无搜索结果时跳过 LLM 处理
   - 预过滤减少输入 token
   - 验证无相关结果时跳过后续步骤
5. **错误处理**：完善的错误处理和重试机制
6. **可配置性**：所有关键参数都可通过 `.env` 文件配置

## 部署脚本 (`deploy/local/`)
- `run_e2e.bat`: 一键脚本（安装依赖→启动服务→健康检查→采集→处理→分析→导出）

