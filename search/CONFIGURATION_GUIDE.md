# 配置指南

## 1. 时间过滤配置

### 问题：是否可以配置？

**答案：可以！** 现在已经实现了统一的时间窗口配置。

### 配置项

**文件**: `.env` 或 `env.template`

```env
# 新闻搜索时间窗口（天），从事件当天开始向后搜索的天数
NEWS_SEARCH_WINDOW_DAYS=3
```

### 作用

1. **统一所有API的时间窗口**
   - The News API：使用 `NEWS_SEARCH_WINDOW_DAYS`
   - YouTube API：使用 `NEWS_SEARCH_WINDOW_DAYS`
   - Tavily API：不支持时间过滤参数（依赖查询字符串）

2. **可配置**
   - 默认值：3天
   - 建议值：3-7天（考虑新闻时效性）
   - 可以根据需要调整

3. **使用方式**
   ```python
   # 在采集器中
   window_days = self.config.NEWS_SEARCH_WINDOW_DAYS
   params["published_after"] = event_time.strftime("%Y-%m-%d")
   params["published_before"] = (event_time + timedelta(days=window_days + 1)).strftime("%Y-%m-%d")
   ```

### 示例

**事件时间**: 2025-10-11
**NEWS_SEARCH_WINDOW_DAYS**: 3

**搜索范围**:
- 开始: 2025-10-11（事件当天）
- 结束: 2025-10-14（事件当天 + 3天）

---

## 2. 预过滤配置

### 问题：在交给LLM前进行准确性判断

**答案：已实现！** 现在可以在交给LLM前进行简单的规则判断。

### 配置项

**文件**: `.env` 或 `env.template`

```env
# 是否启用预过滤
PRE_FILTER_ENABLED=true

# 预过滤模式：strict（严格）或 loose（宽松）
PRE_FILTER_MODE=strict

# 预过滤时间窗口（天）
PRE_FILTER_TIME_WINDOW_DAYS=3
```

### 过滤规则

#### 1. 时间过滤
- **规则**: 只保留事件时间 ± 3天内的结果
- **判断**: 比较 `published_at` 和 `event_time`
- **实现**: 简单的日期比较

#### 2. 地点过滤
- **规则**: 标题或摘要中包含地点关键词（省名、国家名）
- **判断**: 检查是否包含 `province` 或 `country`
- **实现**: 简单的字符串匹配

#### 3. 关键词过滤
- **规则**: 标题或摘要中包含灾害关键词（rain、flood等）
- **判断**: 检查是否包含 `rain_term` 或 `flood_term`
- **实现**: 简单的字符串匹配

### 过滤模式

#### Strict 模式（推荐）
- **条件**: 必须同时满足所有条件（时间 + 地点 + 关键词）
- **效果**: 只保留高度相关的结果
- **优势**: 减少token消耗，提高准确性

#### Loose 模式
- **条件**: 满足任意一个条件即可（时间 或 地点 或 关键词）
- **效果**: 保留更多结果
- **优势**: 不会遗漏可能相关的结果

### 示例

**事件信息**:
- 时间: 2025-10-11
- 地点: Valencia, Spain
- 关键词: lluvia, inundación

**搜索结果**:
1. "Valencia flood October 11, 2025" ✅ (时间+地点+关键词)
2. "Spain rain October 12, 2025" ✅ (时间+地点+关键词)
3. "Valencia weather October 15, 2025" ❌ (时间不匹配，超过3天)
4. "Madrid flood October 11, 2025" ❌ (地点不匹配)

**Strict 模式**: 只保留 1 和 2
**Loose 模式**: 保留 1、2、3（如果时间匹配）

---

## 配置总结

### 时间过滤配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `NEWS_SEARCH_WINDOW_DAYS` | 3 | 新闻搜索时间窗口（天） |

### 预过滤配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `PRE_FILTER_ENABLED` | true | 是否启用预过滤 |
| `PRE_FILTER_MODE` | strict | 预过滤模式（strict/loose） |
| `PRE_FILTER_TIME_WINDOW_DAYS` | 3 | 预过滤时间窗口（天） |

### 使用建议

1. **时间窗口**: 建议3-7天（考虑新闻时效性）
2. **预过滤**: 建议启用（减少token消耗）
3. **过滤模式**: 建议使用strict（提高准确性）

---

## 效果对比

### 之前

- 16条数据 → 直接给LLM → 输入token: 2409 → 输出被截断

### 现在（启用预过滤）

- 16条数据 → 预过滤（可能过滤到8-10条）→ 给LLM → 输入token: 约1200 → 正常输出

### 优势

1. **减少token消耗**: 过滤掉不相关数据
2. **提高准确性**: 只让LLM处理可能相关的结果
3. **降低成本**: 减少LLM调用成本
4. **提高速度**: 减少LLM处理时间

