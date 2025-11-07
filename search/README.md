# Search Pipeline - 降雨事件信息搜索与报告生成系统

## 项目简介

Search Pipeline 是一个智能化的降雨事件信息搜索与报告生成系统。系统能够自动识别降雨事件的地点、国家和官方语言，使用本地语言进行多源信息搜索，并通过大语言模型（LLM）进行智能处理，最终生成结构化的英文洪水事件报告。

## 核心特性

### 🎯 智能处理流程
- **自动地理识别**：根据事件地点自动识别国家和官方语言
- **多语言搜索**：使用本地语言（如西班牙语、挪威语）进行搜索，提高信息准确性
- **LLM 驱动**：完全使用大语言模型（OpenAI GPT / Google Gemini）进行信息验证、提取和报告生成
- **多源采集**：支持官方来源、新闻、视频、社交媒体等多种数据源

### 📊 处理能力
- **事件验证**：智能判断搜索结果是否属于特定事件
- **时间线提取**：自动提取详细的事件时间线（按时间段组织）
- **影响评估**：分析交通、经济、安全、应急响应等方面的影响
- **多媒体筛选**：从视频和多媒体内容中选择最相关的内容
- **报告生成**：生成包含所有必要信息的完整英文报告

### ⚙️ 技术特点
- **模块化设计**：参考 BettaFish 的 Agent 架构，按功能拆分为独立模块
- **可配置性**：所有关键参数都可通过 `.env` 文件配置
- **成本优化**：预过滤、智能跳过等机制减少 LLM 调用成本
- **详细日志**：完整的处理过程日志，便于调试和审计

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `env.template` 到项目根目录的 `.env` 文件，并填写必要的 API 密钥：

```env
# LLM 配置
LLM_PROVIDER=gemini  # 或 openai
GEMINI_API_KEY=your_gemini_api_key
# OPENAI_API_KEY=your_openai_api_key

# 搜索 API 配置
TAVILY_API_KEY=your_tavily_api_key
THENEWSAPI_KEY=your_thenewsapi_key
YOUTUBE_API_KEY=your_youtube_api_key

# 数据库配置
DB_FILE=apps/api/dev.db
RAIN_EVENTS_TABLE=rain_event
```

### 3. 运行测试

```bash
# 测试 API 密钥
python test_api_keys.py

# 测试完整流程
python test_search.py --json test_event.json
```

## 项目结构

```
search/
├── config/             配置管理（settings.py, terminology.json）
├── geolingua/          地理与语言解析
├── query/              查询规划（关键词生成）
├── collectors/         数据采集器（新闻、官方、多媒体、社交媒体）
├── llm/                LLM 处理模块（客户端、处理器、Prompt）
├── orchestrator/       流程编排（主工作流）
├── utils/              工具函数（详细日志）
├── watcher/            事件监控（从数据库读取事件）
└── knowledge/          知识存储（未来扩展）
```

详细结构说明请参考 [CODE_TREE.md](../CODE_TREE.md)。

## 处理流程

1. **事件识别** → 从 `rain_events` 表读取降雨事件
2. **地理解析** → 识别国家和官方语言
3. **关键词规划** → 生成多语言关键词和查询字符串
4. **数据采集** → 从多个来源采集信息（官方、新闻、视频）
5. **预过滤** → 规则判断，减少 LLM 输入（可选）
6. **LLM 处理** → 4 步智能处理（验证、提取、筛选、生成）
7. **报告输出** → 生成 Markdown 格式的英文报告

## 配置说明

### LLM 配置

- `LLM_PROVIDER`: 选择 LLM 提供商（openai 或 gemini）
- `LLM_TEMPERATURE`: 温度参数（默认 0.3，较低值更稳定）
- `LLM_MAX_TOKENS`: 最大输出 token（默认 8000，防止截断）

### 搜索配置

- `NEWS_SEARCH_WINDOW_DAYS`: 新闻搜索时间窗口（默认 3 天）
- `LLM_VALIDATION_TIME_WINDOW_DAYS`: LLM 验证时间窗口（默认 5 天）

### 预过滤配置

- `PRE_FILTER_ENABLED`: 是否启用预过滤（默认 true）
- `PRE_FILTER_MODE`: strict（严格）或 loose（宽松）
- `MAX_ITEMS_FOR_LLM_VALIDATION`: 交给 LLM 验证的最大数量（默认 10）

详细配置说明请参考 [CONFIGURATION_GUIDE.md](CONFIGURATION_GUIDE.md)。

## 输出文件

运行后会在 `search_outputs/` 目录生成以下文件：

- `{event_id}_report.md`: 最终生成的英文报告
- `{event_id}_raw_items_before_filter.md`: 预过滤前的原始搜索结果
- `{event_id}_filtered_items_after_prefilter.md`: 预过滤后的结果
- `{event_id}_llm_validation_results.md`: LLM 验证结果（含排除原因）
- `test_log.md`: 完整的处理过程日志（包括所有 Prompt 和 LLM 响应）

## 文档

- [INSTALL.md](INSTALL.md) - 安装指南
- [TEST.md](TEST.md) - 测试指南
- [CONFIGURATION_GUIDE.md](CONFIGURATION_GUIDE.md) - 配置指南
- [CODE_TREE.md](../CODE_TREE.md) - 代码结构解析

## 版本历史

- **v1.0.4** - 完整的 LLM 驱动处理流程，支持 OpenAI 和 Gemini
- **v1.0.3** - 添加预过滤和详细日志功能
- **v1.0.2** - 多语言搜索和关键词优化
- **v1.0.1** - 初始版本，基础搜索功能

## 许可证

本项目为内部项目，仅供授权用户使用。
