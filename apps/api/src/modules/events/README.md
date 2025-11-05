# 事件模块（Events Module）

## 模块结构

```
events/
├── README.md              # 本文件
├── routes.ts              # 候选事件API（原始数据，按平台分开）
├── merger-routes.ts       # 合并事件API（多平台合并）
├── merger.ts              # 事件合并逻辑（核心）
├── matching.ts            # 事件匹配算法
├── service.ts             # 候选事件服务（单平台采集）
├── enrich.ts              # 事件整理（多源采集+入库）
└── collectors/
    ├── gdacs.ts           # GDACS采集器
    └── meteoalarm.ts      # Meteoalarm采集器（框架）
```

## 两个工作流程

### 1. 候选事件流程（`routes.ts`）
- **用途**：查看各平台原始数据
- **API**: `GET /events/candidates?date_from=...&date_to=...`
- **特点**：不同平台的事件分开存储，不去重
- **表**: `event_candidates`

### 2. 合并事件流程（`merger-routes.ts`）⭐ 推荐
- **用途**：多平台查询 + 自动合并相同事件
- **API**: `GET /events/merged?date_from=...&date_to=...`
- **特点**：自动识别并合并相同事件，提高准确性
- **表**: `merged_flood_events`

## 事件合并模块（Merger Module）

### 功能
1. **多平台查询**：同时从 GDACS、Meteoalarm 等平台采集
2. **智能匹配**：基于坐标、时间、国家判断是否为同一事件
3. **自动合并**：相同事件合并为一条记录，记录所有来源
4. **数据增强**：合并时选择更准确的坐标、更严重的等级

### 匹配规则

```typescript
// 两个事件被认为是同一场降雨，需要满足：
1. 国家相同（必须）
2. 时间重叠（±12小时内）
3. 坐标距离 < 50km（如果有坐标）
   或
   城市相同（如果没有坐标）
```

### API 接口

#### GET `/events/merged?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&refresh=true`
查询并合并事件

**参数**：
- `date_from`: 开始日期（必需）
- `date_to`: 结束日期（必需）
- `refresh`: 是否强制刷新（默认false，使用缓存）

**响应**：
```json
{
  "events": [
    {
      "id": 1,
      "globalEventKey": "event_2025-10-11_spain_40.4_-3.7_2025-10-11T10",
      "eventDate": "2025-10-11",
      "country": "Spain",
      "city": "Madrid",
      "latitude": 40.4,
      "longitude": -3.7,
      "timeFrom": "2025-10-11T10:00:00Z",
      "severity": "high",
      "level": 4,
      "sources": ["gdacs", "meteoalarm"],  // 数据来源列表
      "sourceCount": 2,                     // 来源数量（多源证据）
      "titles": ["Spain - flood", "Madrid Flood Alert"],
      "descriptions": ["...", "..."],
      "sourceUrls": ["https://...", "https://..."],
      "enriched": false
    }
  ],
  "stats": {
    "gdacs": 5,        // GDACS采集到的事件数
    "meteoalarm": 3,   // Meteoalarm采集到的事件数
    "total": 8,        // 总事件数（合并前）
    "merged": 6        // 合并后的事件数
  },
  "cached": true,
  "dateRange": { "from": "2025-10-11", "to": "2025-10-13" }
}
```

#### GET `/events/merged/:id`
获取合并事件的详细信息

## merged_flood_events 表结构

```sql
CREATE TABLE merged_flood_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  global_event_key TEXT UNIQUE,      -- 全局唯一键（跨平台）
  event_date TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT,
  latitude REAL,
  longitude REAL,
  time_from TEXT,
  time_to TEXT,
  severity TEXT,
  level INTEGER,
  sources TEXT,                       -- JSON: ['gdacs', 'meteoalarm']
  source_count INTEGER DEFAULT 1,    -- 来源数量（多源证据）
  titles TEXT,                        -- JSON: ['title1', 'title2']
  descriptions TEXT,                  -- JSON: ['desc1', 'desc2']
  source_urls TEXT,                   -- JSON: ['url1', 'url2']
  enriched BOOLEAN DEFAULT 0,
  enriched_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 使用建议

**推荐使用合并事件API**：
- ✅ 自动去重，避免重复事件
- ✅ 多源证据，提高准确性
- ✅ 数据更完整（合并多个来源的信息）

**使用候选事件API的场景**：
- 需要查看原始数据（未合并）
- 需要按平台区分数据
- 调试数据采集问题

