# 本地一键打通脚本使用说明

本目录提供 Windows 批处理脚本，完成本地 API 的端到端流程：采集 → 处理 → 分析 → 导出。

## 前提
- 已安装 Node.js 18+（建议 20+）
- 首次运行会自动安装依赖并生成默认 `.env`

## 使用
```
E:\\Project\\europe\\deploy\\local\\run_e2e.bat
```
脚本会：
- 启动 `apps/api` 服务（新窗口）
- 等待 `/health` 就绪
- 调用：`/ingestion/run` → `/processing/run` → `/analysis/summary`
- 下载导出：`/export` → `deploy/local/export.csv`

## 常见问题
- 端口占用：修改 `apps/api/.env` 中的 `PORT`，并重新运行脚本。
- 网络工具：脚本依赖系统 `curl`（Win10+自带）。若缺失，请安装或手动调用 PowerShell `Invoke-RestMethod`。
- 服务窗口日志：名为 "EUflood API" 的新窗口内可查看实时日志。

