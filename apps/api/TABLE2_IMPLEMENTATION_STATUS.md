# 表2填写实现状态

## 当前状态：❌ **还不能完整填写表2**

## 已完成的组件

### ✅ 1. 数据库表结构
- **位置**：`apps/api/src/db.ts`
- **状态**：✅ 已完成
- **内容**：`rain_flood_impact` 表已创建，包含所有字段

### ✅ 2. LLM流程
- **位置**：`search/llm/processor.py`
- **状态**：✅ 已完成
- **功能**：
  - 步骤1：验证（提取 `relevant_items`）
  - 步骤2：提取（提取 `timeline` 和 `impact`）
  - 步骤3：媒体筛选
  - 步骤4：报告生成

### ✅ 3. 智能提示词
- **位置**：`search/llm/prompts.py`
- **状态**：✅ 已完成
- **功能**：支持三层提取策略（数字优先 → 描述补充 → 推断严重程度）

---

## 缺失的组件

### ❌ 1. 评分计算模块

**需要实现的功能：**
- `calculate_transport_impact_level()` - 计算交通影响程度（1-10分）
- `calculate_economy_impact_level()` - 计算经济影响程度（1-10分）
- `calculate_safety_impact_level()` - 计算安全影响程度（1-10分）
- `calculate_overall_level()` - 计算整体级别（1-4级）

**实现位置：**
- 选项A：Node.js（`apps/api/src/modules/impact/scoring.ts`）
- 选项B：Python（`search/llm/scoring.py`）

**当前状态：** 只有文档中的示例代码，没有实际实现

---

### ❌ 2. 表2数据填充逻辑

**需要实现的功能：**
- 从LLM结果中提取数据
- 计算所有字段值
- 插入或更新 `rain_flood_impact` 表

**实现位置：**
- 选项A：Node.js API（`apps/api/src/modules/impact/service.ts`）
- 选项B：Python脚本（`search/llm/db_writer.py`）

**当前状态：** 只有文档中的示例代码，没有实际实现

---

### ❌ 3. 工作流对接

**问题：**
- LLM处理在Python中完成（`search/orchestrator/workflow.py`）
- 数据库操作在Node.js中（`apps/api/src/db.ts`）
- 需要建立连接

**解决方案：**
- 选项A：Python调用Node.js API（HTTP请求）
- 选项B：Python直接操作SQLite数据库（使用sqlite3库）
- 选项C：Node.js调用Python脚本（通过子进程）

**当前状态：** 未实现

---

## 完整实现所需步骤

### 步骤1：实现评分计算模块

**文件**：`apps/api/src/modules/impact/scoring.ts`（新建）

```typescript
// 计算交通影响程度（1-10分）
export function calculateTransportImpactLevel(
  transportImpact: any
): number | null {
  if (!transportImpact?.quantitative_data) {
    return null;
  }
  
  const data = transportImpact.quantitative_data;
  
  // 策略1：如果有数字，使用数字计算
  const closedRoads = extractNumber(data.closed_roads);
  const bridgesDamaged = extractNumber(data.bridges_damaged);
  
  if (closedRoads !== null || bridgesDamaged !== null) {
    let score = 0;
    if (closedRoads !== null) {
      if (closedRoads >= 30) score += 9;
      else if (closedRoads >= 15) score += 7;
      else if (closedRoads >= 5) score += 5;
      else if (closedRoads >= 1) score += 2;
      else score += 1;
    }
    if (bridgesDamaged !== null) {
      if (bridgesDamaged >= 3) score += 2;
      else if (bridgesDamaged >= 1) score += 1;
    }
    return Math.min(10, Math.max(1, score));
  }
  
  // 策略2：如果没有数字，使用severity_inference
  const severity = data.severity_inference?.toLowerCase();
  if (severity === "extreme") return 9;
  if (severity === "high") return 7;
  if (severity === "moderate") return 5;
  if (severity === "low") return 2;
  if (severity === "very_low") return 1;
  
  // 策略3：如果都没有，使用description中的关键词
  const description = data.description?.toLowerCase() || "";
  if (["severe", "extensive", "major", "massive"].some(w => description.includes(w))) {
    return 7;
  }
  if (["some", "several", "moderate"].some(w => description.includes(w))) {
    return 5;
  }
  if (["minor", "limited", "few"].some(w => description.includes(w))) {
    return 2;
  }
  
  return 1;
}

// 类似地实现 calculateEconomyImpactLevel 和 calculateSafetyImpactLevel
// 实现 calculateOverallLevel
```

---

### 步骤2：实现表2数据填充服务

**文件**：`apps/api/src/modules/impact/service.ts`（新建）

```typescript
import { db } from '../../db';
import {
  calculateTransportImpactLevel,
  calculateEconomyImpactLevel,
  calculateSafetyImpactLevel,
  calculateOverallLevel,
} from './scoring';

export interface LLMResult {
  validation: {
    relevant_items: any[];
  };
  extraction: {
    timeline: any[];
    impact: {
      transport?: any;
      economy?: any;
      safety?: any;
    };
  };
  report: string;
}

export function fillRainFloodImpactTable(
  rainEventId: string,
  llmResult: LLMResult
): void {
  // 1. 获取表1数据
  const rainEvent = db.prepare('SELECT * FROM rain_event WHERE id = ?').get(rainEventId) as any;
  if (!rainEvent) {
    throw new Error(`Rain event not found: ${rainEventId}`);
  }
  
  // 2. 提取LLM结果
  const validation = llmResult.validation || {};
  const extraction = llmResult.extraction || {};
  const impact = extraction.impact || {};
  
  // 3. 计算基础字段（从表1复制）
  const country = rainEvent.country;
  const province = rainEvent.province;
  const city = rainEvent.city;
  
  // 4. 计算时间字段
  const timeline = extraction.timeline || [];
  let time: string;
  if (timeline.length > 0 && timeline[0].time_slot) {
    const timeSlot = timeline[0].time_slot;
    time = timeSlot.split(' ')[0]; // 提取日期部分
  } else {
    time = rainEvent.date;
  }
  
  // 5. 计算影响程度
  const transportLevel = calculateTransportImpactLevel(impact.transport);
  const economyLevel = calculateEconomyImpactLevel(impact.economy);
  const safetyLevel = calculateSafetyImpactLevel(impact.safety);
  
  // 6. 计算整体级别
  const level = calculateOverallLevel(transportLevel, economyLevel, safetyLevel);
  
  // 7. 时间线数据（JSON字符串）
  const timelineData = JSON.stringify(timeline);
  
  // 8. 来源数量
  const sourceCount = validation.relevant_items?.length || 0;
  
  // 9. 文件路径
  const dateDir = rainEvent.date.replace(/-/g, '');
  const detailFile = `search_outputs/${dateDir}/${rainEventId}_report.md`;
  
  // 10. 插入或更新表2
  const insertOrUpdate = db.prepare(`
    INSERT INTO rain_flood_impact (
      rain_event_id, time, level,
      country, province, city,
      transport_impact_level, economy_impact_level, safety_impact_level,
      timeline_data, source_count, detail_file,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(rain_event_id) DO UPDATE SET
      time = excluded.time,
      level = excluded.level,
      country = excluded.country,
      province = excluded.province,
      city = excluded.city,
      transport_impact_level = excluded.transport_impact_level,
      economy_impact_level = excluded.economy_impact_level,
      safety_impact_level = excluded.safety_impact_level,
      timeline_data = excluded.timeline_data,
      source_count = excluded.source_count,
      detail_file = excluded.detail_file,
      updated_at = datetime('now')
  `);
  
  insertOrUpdate.run(
    rainEventId, time, level,
    country, province, city,
    transportLevel, economyLevel, safetyLevel,
    timelineData, sourceCount, detailFile
  );
}
```

---

### 步骤3：实现工作流对接

**选项A：Python直接操作数据库（推荐）**

**文件**：`search/llm/db_writer.py`（新建）

```python
import sqlite3
import json
from pathlib import Path
from typing import Dict, Any, Optional

def fill_rain_flood_impact_table(
    db_path: str,
    rain_event_id: str,
    llm_result: Dict[str, Any],
    rain_event: Dict[str, Any]  # 从数据库查询的表1数据
) -> None:
    """填充表2数据（Python实现）"""
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 提取数据
    validation = llm_result.get("validation", {})
    extraction = llm_result.get("extraction", {})
    impact = extraction.get("impact", {})
    timeline = extraction.get("timeline", [])
    
    # 计算字段值（需要实现评分计算函数）
    from .scoring import (
        calculate_transport_impact_level,
        calculate_economy_impact_level,
        calculate_safety_impact_level,
        calculate_overall_level,
    )
    
    transport_level = calculate_transport_impact_level(impact.get("transport"))
    economy_level = calculate_economy_impact_level(impact.get("economy"))
    safety_level = calculate_safety_impact_level(impact.get("safety"))
    level = calculate_overall_level(transport_level, economy_level, safety_level)
    
    # 时间字段
    if timeline and len(timeline) > 0:
        time_slot = timeline[0].get("time_slot", "")
        time = time_slot.split(" ")[0] if " " in time_slot else time_slot
    else:
        time = rain_event["date"]
    
    # 其他字段
    timeline_data = json.dumps(timeline)
    source_count = len(validation.get("relevant_items", []))
    date_dir = rain_event["date"].replace("-", "")
    detail_file = f"search_outputs/{date_dir}/{rain_event_id}_report.md"
    
    # 插入或更新
    cursor.execute("""
        INSERT INTO rain_flood_impact (
            rain_event_id, time, level,
            country, province, city,
            transport_impact_level, economy_impact_level, safety_impact_level,
            timeline_data, source_count, detail_file,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(rain_event_id) DO UPDATE SET
            time = excluded.time,
            level = excluded.level,
            country = excluded.country,
            province = excluded.province,
            city = excluded.city,
            transport_impact_level = excluded.transport_impact_level,
            economy_impact_level = excluded.economy_impact_level,
            safety_impact_level = excluded.safety_impact_level,
            timeline_data = excluded.timeline_data,
            source_count = excluded.source_count,
            detail_file = excluded.detail_file,
            updated_at = datetime('now')
    """, (
        rain_event_id, time, level,
        rain_event["country"], rain_event["province"], rain_event.get("city"),
        transport_level, economy_level, safety_level,
        timeline_data, source_count, detail_file
    ))
    
    conn.commit()
    conn.close()
```

**在workflow中调用：**

```python
# search/orchestrator/workflow.py
def _process_contents(self, context: EventContext) -> Dict[str, Any]:
    # ... LLM处理 ...
    result = processor.process(context)
    
    # 新增：填充表2
    if result.get("extraction"):
        from ..llm.db_writer import fill_rain_flood_impact_table
        from ..config.settings import settings
        
        # 获取表1数据
        import sqlite3
        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rain_event WHERE id = ?", (context.rain_event.event_id,))
        rain_event = dict(zip([col[0] for col in cursor.description], cursor.fetchone()))
        conn.close()
        
        # 填充表2
        fill_rain_flood_impact_table(
            settings.DB_FILE,
            context.rain_event.event_id,
            result,
            rain_event
        )
    
    return {...}
```

---

## 实施优先级

### 高优先级（立即实施）

1. ✅ **评分计算模块**（Python或Node.js）
2. ✅ **表2数据填充逻辑**（Python，因为LLM在Python中）
3. ✅ **工作流对接**（在workflow中调用填充函数）

### 中优先级（后续优化）

1. ⚠️ 数据验证和容错
2. ⚠️ 错误处理和日志记录
3. ⚠️ 单元测试

---

## 总结

**当前状态：** ❌ 还不能完整填写表2

**缺失的关键组件：**
1. 评分计算函数（3个影响程度 + 1个整体级别）
2. 表2数据填充逻辑
3. Python工作流与数据库的对接

**建议实施顺序：**
1. 先实现Python版本的评分计算和数据库写入（因为LLM在Python中）
2. 后续可以考虑Node.js版本（如果需要API接口）

