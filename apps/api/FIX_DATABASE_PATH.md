# 数据库路径问题修复

## 问题描述

错误信息：`unable to open database file`

**原因：**
- `rain_event_watcher.py` 中路径计算错误
- 使用了 `parents[3]` 而不是 `parents[2]`
- 导致路径计算为 `E:\Project\apps\api\dev.db`（错误）
- 正确路径应该是 `E:\Project\europe\apps\api\dev.db`

## 修复内容

**文件：** `search/watcher/rain_event_watcher.py`

**修改：**
- 将 `parents[3]` 改为 `parents[2]`
- 添加默认路径处理（如果 `.env` 中没有配置 `DB_FILE`，使用 `apps/api/dev.db`）
- 添加目录存在性检查

## 路径计算说明

```
search/watcher/rain_event_watcher.py
    ↓ parents[0]
search/watcher/
    ↓ parents[1]
search/
    ↓ parents[2]
europe/  ← 项目根目录
    ↓
apps/api/dev.db
```

## 现在可以正常使用了

重新运行测试：
```bash
apps/api/python-embed/python.exe search/test_search.py
```

应该可以正常连接数据库了。

