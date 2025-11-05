# 新闻网站RSS数据源模块

## 已调研的RSS源

### France 24
- 文档：`.cursor/france24_rss_feeds_report.md`
- 状态：✅ 可用
- RSS URL：`https://www.france24.com/{lang}/rss`
- 实现：`france24/service.ts`, `france24/parser.ts`

### ANSA (意大利通讯社)
- 文档：`.cursor/ANSA_RSS_Feeds_Report.md`
- 状态：✅ 可用
- RSS URL：`https://www.ansa.it/sito/...`
- 实现：`ansa/service.ts`, `ansa/parser.ts`

### Le Monde
- 文档：`.cursor/lemonde_rss_final_report.md`
- 状态：⚠️ 可能存在访问限制
- 实现：`lemonde/service.ts`

### Le Figaro
- 文档：`.cursor/lefigaro_rss_research_report.md`
- 状态：⚠️ 需验证
- 实现：`lefigaro/service.ts`

### RAI (意大利广播)
- 文档：`.cursor/rai_rss_research_report.md`
- 状态：⚠️ 仅发现1个feed
- 实现：`rai/service.ts`

### DW (德国之声)
- 文档：`.cursor/dw_rss_research_report.md`
- 状态：⚠️ 访问困难
- 实现：`dw/service.ts`

### El Mundo
- RSS数据：`.cursor/data/elmundo_rss_feeds.json`
- 文档：`.cursor/docs/El_Mundo_RSS_Report.md`
- 实现：`elmundo/service.ts`

### El Punt Avui
- 文档：`.cursor/elpuntavui_rss_feeds_report.md`
- 实现：`elpuntavui/service.ts`

### 荷兰媒体
- 文档：`.cursor/dutch_rss_feeds_report.md`
- 实现：`dutch/service.ts`

## RSS解析器

所有RSS源共享一个通用的RSS解析器：
- `shared/rss-parser.ts` - 解析XML RSS格式
- 提取：title, description, link, pubDate, country, location等

