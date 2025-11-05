# 需要API Key的数据来源模块

## 已调研的数据源

### AEMET (西班牙国家气象局)
- 文档：`.cursor/AEMET_API_Integration_Final_Summary.md`
- 状态：⚠️ 需要申请API Key
- 实现：`aemet/service.ts`
- 配置：在 `.env` 中设置 `AEMET_API_KEY`

## API Key管理

所有需要API Key的数据源应从环境变量读取：
```env
AEMET_API_KEY=your_key_here
TWITTER_BEARER_TOKEN=your_token_here
```

## 错误处理

当API Key缺失或无效时，应返回明确的错误信息，而不是静默失败。

