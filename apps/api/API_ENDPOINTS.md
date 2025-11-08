# API接口文档

## 表1（rain_event）查看接口

### GET `/python/rain/list`

查看降雨事件列表（表1数据）

**查询参数：**
- `page` (可选): 页码，默认 1
- `limit` (可选): 每页数量，默认 100
- `date` (可选): 日期筛选，格式：YYYY-MM-DD
- `province` (可选): 省份筛选
- `country` (可选): 国家筛选

**示例：**
```
GET http://localhost:3000/python/rain/list
GET http://localhost:3000/python/rain/list?page=1&limit=50
GET http://localhost:3000/python/rain/list?date=2025-10-11&province=Valencia
```

**响应格式：**
```json
{
  "success": true,
  "total": 100,
  "page": 1,
  "limit": 100,
  "totalPages": 1,
  "data": [
    {
      "id": "20251011_Valencia_1",
      "date": "2025-10-11",
      "country": "Spain",
      "province": "Valencia",
      "city": "Carcaixent",
      "longitude": -0.4459,
      "latitude": 39.1134,
      "value": 102.0,
      "threshold": 50.0,
      "file_name": "pr20251011_20251013021010_ext.txt",
      "seq": 1,
      "searched": 1
    }
  ]
}
```

---

## 表2（rain_flood_impact）查看接口

### GET `/python/rain/impact/list`

查看降雨洪水影响汇总列表（表2数据）

**查询参数：**
- `page` (可选): 页码，默认 1
- `limit` (可选): 每页数量，默认 100
- `date` (可选): 日期筛选，格式：YYYY-MM-DD（匹配time字段）
- `province` (可选): 省份筛选
- `country` (可选): 国家筛选
- `level` (可选): 整体级别筛选（1-4）
- `rain_event_id` (可选): 事件ID筛选

**示例：**
```
GET http://localhost:3000/python/rain/impact/list
GET http://localhost:3000/python/rain/impact/list?page=1&limit=50
GET http://localhost:3000/python/rain/impact/list?level=3
GET http://localhost:3000/python/rain/impact/list?rain_event_id=20251011_Valencia_1
GET http://localhost:3000/python/rain/impact/list?date=2025-10-11&province=Valencia&level=3
```

**响应格式：**
```json
{
  "success": true,
  "total": 50,
  "page": 1,
  "limit": 100,
  "totalPages": 1,
  "data": [
    {
      "id": 1,
      "rain_event_id": "20251011_Valencia_1",
      "time": "2025-10-11",
      "level": 3,
      "country": "Spain",
      "province": "Valencia",
      "city": "Carcaixent",
      "transport_impact_level": 7,
      "economy_impact_level": 6,
      "safety_impact_level": 1,
      "timeline_data": [
        {
          "time_slot": "2025-10-11 00:00-06:00",
          "events": ["Rainfall began"],
          "highlights": "Rainfall started",
          "references": ["index0"]
        }
      ],
      "source_count": 5,
      "detail_file": "search_outputs/20251011/20251011_Valencia_1_report.md",
      "created_at": "2025-11-08 10:30:00",
      "updated_at": "2025-11-08 10:30:00"
    }
  ]
}
```

**字段说明：**
- `id`: 表2主键（自增）
- `rain_event_id`: 关联表1的事件ID
- `time`: 事件时间
- `level`: 整体级别（1-4级）
- `transport_impact_level`: 交通影响程度（1-10分）
- `economy_impact_level`: 经济影响程度（1-10分）
- `safety_impact_level`: 安全影响程度（1-10分）
- `timeline_data`: 时间线数据（已解析为JSON对象）
- `source_count`: 相关数据源数量
- `detail_file`: 详情报告文件路径

---

## 使用示例

### 1. 查看所有表2数据
```bash
curl http://localhost:3000/python/rain/impact/list
```

### 2. 查看特定级别的影响
```bash
curl "http://localhost:3000/python/rain/impact/list?level=3"
```

### 3. 查看特定事件的影响
```bash
curl "http://localhost:3000/python/rain/impact/list?rain_event_id=20251011_Valencia_1"
```

### 4. 分页查询
```bash
curl "http://localhost:3000/python/rain/impact/list?page=2&limit=20"
```

### 5. 组合筛选
```bash
curl "http://localhost:3000/python/rain/impact/list?date=2025-10-11&province=Valencia&level=3"
```

---

## 注意事项

1. **timeline_data字段**：已自动解析为JSON对象，无需手动解析
2. **分页**：默认每页100条，可通过`limit`参数调整
3. **排序**：按`created_at`降序排列（最新的在前）
4. **筛选**：所有筛选条件都是可选的，可以组合使用

