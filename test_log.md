# 详细流程日志

生成时间: 2025-11-14 20:07:45

---


## 搜索流程详细日志

**描述**: 记录从输入到输出的完整流程

**时间**: 2025-11-14T20:07:11.725268

---

### 📥 输入事件数据

**时间**: 2025-11-14T20:07:11.726268

```json
{
  "event_id": "20251011_East_Cumbria_1",
  "event_time": "2025-10-11T00:00:00",
  "location_name": "Carlisle",
  "country": "United Kingdom",
  "latitude": 55.08949999792393,
  "longitude": -2.6916709999999737,
  "rainfall_mm": 100.8,
  "severity": null,
  "data_source": "pr20251011_20251013021010_ext.txt",
  "province": "East Cumbria",
  "threshold": 44.91200637817383,
  "seq": 1
}
```

---

### ⚙️ 处理步骤: 地理信息解析

**时间**: 2025-11-14T20:07:11.728267

**描述**: 解析事件的地理位置和语言信息

- **输入数据类型**: dict
- **输出数据类型**: dict

---

### ⚙️ 处理步骤: 查询计划生成

**时间**: 2025-11-14T20:07:11.730268

**描述**: 生成多语言关键词和搜索渠道配置

- **输入数据类型**: dict
- **输出数据类型**: dict

**多语言关键词详情**:

#### EN 语言

- **关键词列表** (6 个):
  - East Cumbria, East Cumbria United Kingdom, United Kingdom, rain, flood, October 11, 2025
- **搜索查询**: `United Kingdom rain flood October 11, 2025`

---

### 🔍 预过滤结果

**时间**: 2025-11-14T20:07:16.037053

- **原始结果**: 8 条
- **过滤后**: 1 条
- **移除**: 7 条

**被过滤的项（前10条）**:

#### 项 1

- **标题**: Storm Claudia live: Over 100 flood alerts issued across UK
- **URL**: https://www.the-independent.com/news/uk/home-news/storm-claudia-uk-weather-warnings-flooding-latest-b2864920.html
- **原因**: 地点不匹配
- **检查结果**:
  - 时间匹配: ✓
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

#### 项 2

- **标题**: Cars crushed by falling trees as Storm Claudia batters Britain with 6 ...
- **URL**: https://www.thesun.co.uk/news/37316914/storm-claudia-batters-britain-met-office-warns-flooding/
- **原因**: 地点不匹配
- **检查结果**:
  - 时间匹配: ✓
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

#### 项 3

- **标题**: The first storm of winter has passed – what can we learn from it?
- **URL**: https://catalystservicesuk.com/the-first-storm-of-winter-has-passed-what-can-we-learn-from-it/
- **原因**: 时间不匹配, 地点不匹配
- **检查结果**:
  - 时间匹配: ✗
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

#### 项 4

- **标题**: Storm Claudia to bring heavy and disruptive rain for many - Met Office
- **URL**: https://www.metoffice.gov.uk/about-us/news-and-media/media-centre/weather-and-climate-news/2025/storm-claudia-to-bring-heavy-and-disruptive-rain-for-many
- **原因**: 时间不匹配, 地点不匹配
- **检查结果**:
  - 时间匹配: ✗
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

#### 项 5

- **标题**: Storm Claudia: Trains cancelled and flood warnings in place as UK ...
- **URL**: https://www.itv.com/news/2025-11-14/storm-claudia-amber-warnings-in-place-as-uk-prepares-for-torrential-rain
- **原因**: 时间不匹配, 地点不匹配
- **检查结果**:
  - 时间匹配: ✗
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

#### 项 6

- **标题**: Met Office: Ten years of naming UK storms to warn the public
- **URL**: https://www.carbonbrief.org/met-office-ten-years-of-naming-uk-storms-to-warn-the-public/
- **原因**: 地点不匹配
- **检查结果**:
  - 时间匹配: ✓
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

#### 项 7

- **标题**: Flooding causing traffic delays as Storm Claudia batters West ... - BBC
- **URL**: https://www.bbc.com/news/live/cdegwg0ylezt
- **原因**: 地点不匹配
- **检查结果**:
  - 时间匹配: ✓
  - 地点匹配: ✗
  - 关键词匹配: ✓
- **模式**: strict

---

