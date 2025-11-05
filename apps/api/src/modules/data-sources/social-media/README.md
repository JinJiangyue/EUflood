# 社交媒体数据源模块

## 已调研的平台

### Twitter/X
- 类型：Twitter API v2
- 状态：⚠️ 需要API Key和Bearer Token
- 费用：可能涉及付费计划
- 实现：`twitter/service.ts`
- 配置：`TWITTER_BEARER_TOKEN`

### Facebook
- 类型：Graph API
- 状态：⚠️ 需要API Key
- 限制：访问限制较多
- 实现：`facebook/service.ts`

### 其他平台
- Reddit：可能有公开API（无需key的端点有限）
- Mastodon：部分实例提供公开API

## 数据提取策略

社交媒体数据通常需要：
1. 关键词搜索（如"flood", "洪水", "inundación"等）
2. 地理位置过滤（如果API支持）
3. 时间范围过滤
4. 语言过滤（多语言）

## 数据质量

社交媒体数据通常：
- 置信度较低（0.4-0.5）
- 需要额外的验证和过滤
- 可能包含误报或重复内容

