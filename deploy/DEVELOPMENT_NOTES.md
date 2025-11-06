# Development Notes

## 1.0.2 - 2025-01-13（新增条目，旧内容保留在本条目下方）

### 空间插值分析增强经验

**行政区解析策略**：
- 采用"先域 GeoJSON，后 LAU"的顺序：先用域 GeoJSON 做空间筛选并解析国家/省，再用 LAU 补充城市
- 域 GeoJSON 字段优先级：CNTR_CODE → country_code，NUTS_NAME → province_name，NAME 作为兼容（如 ES_Murcia）
- LAU 仅取 LAU_NAME → city_name，不覆盖已解析的国家/省

**sjoin 列名后缀问题**：
- GeoPandas 的 sjoin 在左右表有同名列时会自动加后缀（_right/_left）
- 解决方案：代码中同时查找 ['NAME', 'NAME_right', 'NAME_left'] 等变体
- 关键发现：域 GeoJSON 的 NAME 在 sjoin 后可能变成 NAME_right，必须兼容

**数据流设计**：
- 第一阶段：域 GeoJSON 空间筛选 → 解析国家/省（保留在 final_points）
- 第二阶段：LAU sjoin → 仅补充 city_name，不触碰国家/省
- 避免覆盖：删除 NUTS 省级 sjoin 分支，防止覆盖已解析的 province_name

**阈值可配置化**：
- 前端输入框改为可编辑（去掉 readonly）
- 后端默认值 50.0，前端传值则覆盖
- 验证逻辑：非法值回退到 50.0

**代码精简原则**：
- 删除所有"尝试多种字段"的冗余逻辑，只保留实际使用的字段
- 移除不必要的日志和调试代码
- 保持表结构干净：只存必需字段，不存文件名/版本等元数据

**测试脚本增强**：
- 使用子进程方式运行，捕获 stdout/stderr 分别处理
- 高亮显示关键日志（域 GeoJSON 字段解析）
- 统计缺失省名的点，便于快速定位问题

## 1.0.1 - 2025-01-13（新增条目，旧内容保留在本条目下方）

### 前端重构经验

**模块化拆分策略**：
- 将 1694 行的单文件拆分为多个模块，每个模块职责清晰
- 按功能划分：stats（统计）、search（搜索）、events（事件）、map（地图）、interpolation（插值）、data-management（数据管理）
- 工具函数独立：`utils.js` 包含可复用的通用函数

**目录结构设计**：
- `frontend/css/`：样式文件（main.css 主样式，map.css 地图样式）
- `frontend/js/modules/`：功能模块
- `frontend/js/utils.js`：工具函数
- `frontend/js/main.js`：主入口，初始化所有模块

**全局变量管理**：
- 地图相关变量（`map`, `geojsonLayer`, `dataPointsLayer` 等）通过 `window` 对象暴露
- 确保模块间可以共享状态
- 保持向后兼容，不影响现有功能

**静态文件服务配置**：
- Express 使用 `express.static` 中间件提供 `frontend/` 目录
- 正确设置 MIME 类型：CSS 为 `text/css`，JS 为 `application/javascript`
- 路径解析：使用 `path.resolve(__dirname, '../../..')` 获取项目根目录

**模块加载顺序**：
- 工具函数 → 功能模块 → 主入口
- 在 HTML 中按依赖关系顺序引用
- 使用 `typeof` 检查函数是否存在，避免未定义错误

**重构优势**：
- 可维护性：代码结构清晰，易于定位和修改
- 可扩展性：新增功能只需添加新模块，不影响现有代码
- 可测试性：模块可独立测试
- 性能：按需加载，减少初始加载体积
- 零构建：无需构建工具，开发简单

### Python 模块集成经验

**嵌入式 Python 策略**：
- 使用嵌入式 Python 3.12，避免系统 Python 版本冲突
- 路径解析采用多级回退机制：环境变量 → 相对路径 → 绝对路径 → 系统 Python
- 通过 `apps/api/.env` 配置 `PYTHON_PATH` 可灵活指定 Python 路径

**坐标转换优化**：
- 初始使用 `apply()` 逐行转换，性能差（19700 个点需要数分钟）
- 改为批量转换（列表推导式），性能提升 100+ 倍
- 使用 `pyproj.Transformer` 一次性转换所有坐标，避免重复创建 transformer

**文件读取灵活性**：
- 支持无表头文件（自动检测：如果第一行全是数字，视为无表头）
- 支持多种分隔符：制表符、逗号、空格、分号
- 优先使用制表符分隔（与原始数据格式一致）
- 自动列名检测：支持常见经纬度列名（longitude/lon/lng/x, latitude/lat/y）

**GeoJSON 空间筛选**：
- 使用 `geopandas.sjoin` 进行空间连接（within 谓词）
- 坐标系统统一：确保 GeoJSON 和点数据都使用 EPSG:4326
- 每区域最大值：使用 `drop_duplicates(subset='index_right', keep='first')` 实现

**前端地图集成**：
- Leaflet.js 初始化问题：需要确保容器可见（`display: block`）再初始化
- 防止重复初始化：检查 `_leaflet_id` 属性
- 错误处理：区分网络错误、超时错误、文件错误，提供针对性建议
- 超时设置：前端 5 分钟，后端 4 分钟（留缓冲时间）

**错误处理最佳实践**：
- Python 脚本：所有进度信息输出到 `stderr`，结果输出到 `stdout`
- Node.js 执行器：捕获 `stderr` 中的 JSON 错误信息，解析并返回
- 前端：区分不同类型的错误（网络、超时、文件、处理），提供具体解决建议
- 日志：在关键步骤添加 `[Progress]` 标记，便于调试

**测试策略**：
- 提供独立的测试脚本 `test_interpolation.py`，可直接运行，无需通过网页
- 测试脚本自动创建示例数据文件（如果不存在）
- 支持命令行参数和配置文件两种方式
- 批处理脚本 `run_test.bat` 方便 Windows 用户快速测试

**性能优化经验**：
- 大数据量处理：19700 个点 → 阈值筛选 25 个 → GeoJSON 筛选 20 个 → 每区域最大值 8 个
- 批量操作优于逐行操作：坐标转换、数据筛选都使用批量方式
- 内存管理：及时关闭图形对象（matplotlib），避免内存泄漏

**数据格式兼容性**：
- 支持多种输入格式：有表头/无表头、多种分隔符、不同坐标系统
- 自动检测和处理：坐标系统、列名、分隔符
- 向后兼容：即使格式不完全匹配，也能尽量解析

## 1.0.0 - 2025-11-05（新增条目，旧内容保留在本条目下方）
- 后端 TS、前端原生 JS：后端有编译链路利于可维护性；前端为零构建即用。
- SQLite 开发策略：用 better-sqlite3（同步、稳定）；通过 PRAGMA 检测列并在线升级，兼容旧库。
- 多源采集：将不同来源差异抽象为记录生成器；统一字段后用 `record_id` 去重，合并证据数与置信度。
- 置信度模型：源头权重 + 字段完整度 + 多源一致度（上限 0.95）；合并时取更高值。
- 地理编码：先内置映射模拟；后续可替换为 Nominatim/Google Geocoding。
- 搜索：从拼关键词改为结构化参数（country/date/severity），q 仍可选。
- 首页直连 API：避免前后端耦合复杂度，先保障可视化验证。
- 迁移策略：将 Postgres 迁移 SQL 留在 `apps/api/sql/migrations` 供未来迁移参考。


