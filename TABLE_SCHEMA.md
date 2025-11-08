# 数据库表结构说明

## 表1：rain_event（降雨事件表）

**说明**：一行 = 一个地点的一次降雨事件

| 字段名 | 类型 | 说明 | 是否主键 |
|--------|------|------|----------|
| **id** | TEXT | 主键，格式：`YYYYMMDD_Province_seq`<br>例如：`20251011_Valencia_1` | ✅ PRIMARY KEY |
| date | TEXT | 日期，格式：`YYYY-MM-DD` | NOT NULL |
| country | TEXT | 国家 | |
| province | TEXT | 省份（必需） | NOT NULL |
| city | TEXT | 城市 | |
| longitude | REAL | 经度（必需） | NOT NULL |
| latitude | REAL | 纬度（必需） | NOT NULL |
| value | REAL | 降雨值（mm） | |
| threshold | REAL | 阈值（mm） | |
| file_name | TEXT | 文件名（必需） | NOT NULL |
| seq | INTEGER | 序号（同一天同一省份的序号） | |
| searched | INTEGER | 搜索状态：0=未搜索，1=已搜索 | DEFAULT 0 |

**索引**：
- `idx_re_date` - 日期索引
- `idx_re_region` - 省份索引
- `idx_re_value` - 降雨值索引
- `uniq_rain_event_dupe` - 唯一索引（date, file_name, longitude, latitude）

---

## 表2：rain_flood_impact（降雨洪水影响汇总表）

**说明**：一行 = 一场降雨的影响汇总，**精准对应表1的一行**

| 字段名 | 类型 | 说明 | 是否主键 | 来源 |
|--------|------|------|----------|------|
| id | INTEGER | 自增主键 | ✅ PRIMARY KEY | 自动生成 |
| **rain_event_id** | TEXT | **外键，直接复制表1的 id**<br>例如：`20251011_Valencia_1` | UNIQUE | **直接复制自表1.id** |
| time | TEXT | 时间 | | **直接复制自表1.date** |
| level | INTEGER | 整体影响级别 | | 从LLM结果计算 |
| country | TEXT | 国家 | | **直接复制自表1.country** |
| province | TEXT | 省份 | | **直接复制自表1.province** |
| city | TEXT | 城市 | | **直接复制自表1.city** |
| transport_impact_level | INTEGER | 交通影响级别 | | 从LLM结果计算 |
| economy_impact_level | INTEGER | 经济影响级别 | | 从LLM结果计算 |
| safety_impact_level | INTEGER | 安全影响级别 | | 从LLM结果计算 |
| timeline_data | TEXT | 时间线数据（JSON字符串） | | 从LLM结果 |
| source_count | INTEGER | 来源数量 | | 从LLM结果 |
| detail_file | TEXT | 详细报告文件路径 | | 自动生成 |
| created_at | TEXT | 创建时间 | | 自动生成 |
| updated_at | TEXT | 更新时间 | | 自动生成 |

**索引**：
- `idx_rain_flood_impact_rain_event_id` - rain_event_id 索引
- `idx_rain_flood_impact_level` - 影响级别索引
- `idx_rain_flood_impact_country` - 国家索引
- `idx_rain_flood_impact_province` - 省份索引

---

## 关键关系

1. **一对一关系**：表2的每一行精准对应表1的一行
2. **外键关系**：`rain_flood_impact.rain_event_id` = `rain_event.id`（完全匹配）
3. **数据复制**：
   - `rain_event_id` ← 直接复制 `rain_event.id`
   - `time` ← 直接复制 `rain_event.date`
   - `country` ← 直接复制 `rain_event.country`
   - `province` ← 直接复制 `rain_event.province`
   - `city` ← 直接复制 `rain_event.city`

## 问题根源

**之前的问题**：
- 表2的 `rain_event_id` 使用了传入的参数，而不是表1的实际 `id`
- 导致 ID 不匹配（例如：表1是 `20251011_Valencia_1`，表2可能是 `20251011_Valencia`）

**修复方案**：
- 表2的 `rain_event_id` 直接使用 `rain_event.id`（表1的实际 ID）
- 不再依赖传入的 ID 参数

