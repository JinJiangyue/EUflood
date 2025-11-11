# ArcGIS StoryMap Trusted Source 集成方案

## 数据来源
- 链接：[ArcGIS StoryMap – Flood Risk](https://storymaps.arcgis.com/stories/6c70797b1eab49ceb421a8990f248bd8/)
- 来源标识：`trusted`
- 默认置信度：`1.0`
- 建议存储：`source_url`、`external_id`（优先使用原始要素的 `OBJECTID` / `GlobalID`）

## 数据处理流程
1. **抓取发现**
   - 访问 StoryMap 配置，解析嵌入的 Feature Layer / Dataset URL。
   - 调用 ArcGIS REST API (`.../FeatureServer/.../query`) 获取结构化要素数据。
2. **字段标准化**
   - 统一日期格式 (`YYYY-MM-DD`)。
   - 行政区名称 → NUTS3 / LAU 编码（结合 `apps/uploads/geofile`）。
   - 解析多边形/点 → `centroid_lon`、`centroid_lat`。
3. **入库（幂等 Upsert）**
   - 以 `external_id + source` 为唯一键。
   - 已存在则更新字段并刷新 `last_seen_at`。
4. **报告生成**
   - 将详细叙述生成 Markdown，保存到 `search_outputs/YYYYMMDD/`。
   - `detail_file` 指向生成的文件路径。

## 映射到 `rain_event`
| 目标字段 | 填充说明 |
|----------|----------|
| `id` | `YYYYMMDD_NUTS3_seq`（若无 seq，可用 `external_id` 衍生）|
| `date` | 事件日期（若给出区间，用开始日；另在 impact 表备注）|
| `country` | 国家名称（标准化）|
| `province` | 省/区域名称（保留原文）|
| `city` | 城市/地区名称（保留原文）|
| `longitude` / `latitude` | 几何中心点 |
| `value` | 若有数值指标（如水位、受影响人口），可填入；无则 NULL |
| `threshold` | 可用于标注危险等级阈值，缺省 NULL |
| `file_name` | 事件标题或 StoryMap section 名称 |
| `seq` | 同一天多条记录时递增 |
| `searched` | 默认 `1`（trusted 数据视为已处理）|
| `source` | `'trusted'` |
| `source_url` | StoryMap 链接 |
| `source_confidence` | `1.0` |
| `external_id` | Feature Layer 的 `OBJECTID` / `GlobalID` |
| `first_seen_at` / `last_seen_at` | ISO 时间戳 |
| `country_code` / `nuts3_code` / `lau_code` | 地理编码映射结果 |
| `centroid_lon` / `centroid_lat` | 与 `longitude/latitude` 一致或更精确 |

### `rain_event` 示例 JSON
```json
{
  "id": "20250915_UKJ34_001",
  "date": "2025-09-15",
  "country": "United Kingdom",
  "province": "Northumberland",
  "city": "Morpeth",
  "longitude": -1.6912,
  "latitude": 55.1633,
  "value": null,
  "threshold": null,
  "file_name": "Morpeth flood defences overview",
  "seq": 1,
  "searched": 1,
  "source": "trusted",
  "source_url": "https://storymaps.arcgis.com/...",
  "source_confidence": 1.0,
  "external_id": "OBJECTID=128",
  "first_seen_at": "2025-11-10T02:50:00Z",
  "last_seen_at": "2025-11-10T02:50:00Z",
  "country_code": "UK",
  "nuts3_code": "UKC21",
  "lau_code": "UKC2101",
  "centroid_lon": -1.6912,
  "centroid_lat": 55.1633
}
```

## 映射到 `rain_flood_impact`
| 目标字段 | 填充说明 |
|----------|----------|
| `rain_event_id` | 对应 `rain_event.id` |
| `time` | 与 `rain_event.date` 对齐或使用更精确时间 |
| `level` | 将站点描述映射为等级（自定义枚举）|
| `country` / `province` / `city` | 同 `rain_event` |
| `transport_impact_level` / `economy_impact_level` / `safety_impact_level` | 根据文本打标签；无信息则设置为 `0` |
| `timeline_data` | 结构化时间线 JSON（如 StoryMap 提供）|
| `source_count` | 若引用其他资料数量，可记录 |
| `detail_file` | 指向生成的 Markdown 报告路径 |
| `created_at` / `updated_at` | 自动 |
| `source` / `source_url` / `source_confidence` / `external_id` | 与 `rain_event` 对齐 |
| `detail_body` | 富文本或 Markdown 正文 |
| `detail_json` | 原始数据 JSON（便于回溯）|
| `first_seen_at` / `last_seen_at` | 同上 |

### `rain_flood_impact` 示例 JSON
```json
{
  "rain_event_id": "20250915_UKJ34_001",
  "time": "2025-09-15",
  "level": 3,
  "country": "United Kingdom",
  "province": "Northumberland",
  "city": "Morpeth",
  "transport_impact_level": 2,
  "economy_impact_level": 3,
  "safety_impact_level": 2,
  "timeline_data": "[{'time': '2025-09-14', 'event': 'Heavy rainfall warning issued'}]",
  "source_count": 4,
  "detail_file": "search_outputs/20250915/20250915_UKJ34_001_report.md",
  "source": "trusted",
  "source_url": "https://storymaps.arcgis.com/...",
  "source_confidence": 1.0,
  "external_id": "OBJECTID=128",
  "detail_body": "### Summary\n- Flood defences activated...",
  "detail_json": "{...原始要素 JSON...}",
  "first_seen_at": "2025-11-10T02:50:00Z",
  "last_seen_at": "2025-11-10T02:50:00Z"
}
```

## 同步与匹配策略
1. **增量同步**：按 `objectid` 或 `editDate` 轮询拉取新要素，更新 `last_seen_at`。
2. **匹配 TXT 降雨事件**：使用日期±1天 + NUTS/LAU 相同 + 中心点距离 < 50km 的规则，计算匹配分，落表 `event_links`。
3. **冲突处理**：若已有同键数据，保留 trusted 为主信息，将差异记录在 `conflict_note` 或 `detail_json`。
4. **溯源**：所有记录保留 `source_url`、`external_id`、`parser_version` 便于回滚与再导入。

---
如需从 StoryMap 抓取实际字段，可基于本文档补充 `official/arcgis_storymap_schema.json` 保存原始字段结构，以便自动映射。





