# 深度搜索完整流程文档

## 流程图

```
用户点击"🔍 开始深度搜索"按钮
    ↓
前端：frontend/js/modules/events.js (行415-477)
    ↓
发送 POST /events/rain/:id/deep-search
    ↓
后端：apps/api/src/modules/events/rain-routes.ts (行280-479)
    ↓
启动Python进程：apps/api/scripts/deep_search.py --json {...}
    ↓
Python：deep_search.py (行95-321)
    ↓
创建 RainEvent 对象 → SearchWorkflow.run_for_event()
    ↓
workflow.py：执行完整搜索流程
    ├─ 地理信息解析
    ├─ 查询计划生成
    ├─ 数据采集
    └─ LLM处理 → _process_contents()
        ├─ LLM验证
        ├─ LLM提取
        └─ 填充表2 → fill_rain_flood_impact_table()
    ↓
Python进程完成（退出码0）
    ↓
后端：轮询检查表2数据（最多10次，每次间隔1秒）
    ↓
找到数据 → 返回成功
未找到数据 → 返回错误
```

---

## 1. 前端：点击按钮触发

**文件：`frontend/js/modules/events.js` (行415-477)**

```javascript
// 用户点击"🔍 开始深度搜索"按钮
btnStartDeepSearch.addEventListener('click', async function() {
    // 1. 确认对话框
    const confirmed = confirm(`确定要对事件 "${eventId}" 进行深度搜索吗？...`);
    if (!confirmed) return;
    
    // 2. 禁用按钮，显示加载状态
    btnStartDeepSearch.disabled = true;
    btnStartDeepSearch.textContent = '搜索中...';
    
    // 3. 发送POST请求（2分钟超时）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2 * 60 * 1000);
    
    try {
        searchRes = await fetch(`/events/rain/${eventId}/deep-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        });
        
        // 4. 处理响应
        const searchData = await searchRes.json();
        if (searchData.success) {
            // 刷新详情面板和列表
            await showRainEventDetails(eventId);
            await loadRainEvents(...);
            alert('深度搜索完成！');
        }
    } catch (e) {
        alert('深度搜索失败: ' + e.message);
    }
});
```

---

## 2. 后端：接收请求并启动Python进程

**文件：`apps/api/src/modules/events/rain-routes.ts` (行280-479)**

```typescript
app.post('/events/rain/:id/deep-search', async (req: Request, res: Response) => {
    // 1. 从表1获取事件数据
    const id = decodeURIComponent(req.params.id);
    const event = db.prepare('SELECT * FROM rain_event WHERE id = ?').get(id);
    
    // 2. 检查是否已经搜索过
    const existingImpact = db.prepare('SELECT * FROM rain_flood_impact WHERE rain_event_id = ?').get(id);
    if (existingImpact) {
        return res.json({ success: true, message: '该事件已经进行过深度搜索' });
    }
    
    // 3. 查找项目根目录和Python脚本
    const searchScript = path.join(projectRoot, 'apps', 'api', 'scripts', 'deep_search.py');
    const pythonExec = fs.existsSync(pythonEmbedPath) ? pythonEmbedPath : 'python';
    
    // 4. 将事件数据转换为JSON
    const eventJson = JSON.stringify({
        id: event.id, date: event.date, country: event.country,
        province: event.province, city: event.city,
        longitude: event.longitude, latitude: event.latitude,
        value: event.value, threshold: event.threshold,
        file_name: event.file_name, seq: event.seq, searched: event.searched
    });
    
    // 5. 启动Python进程
    const pythonProcess = spawn(pythonExec, [searchScript, '--json', eventJson], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONPATH: projectRoot }
    });
    
    // 6. 收集stdout和stderr
    let stdout = '', stderr = '';
    pythonProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });
    
    // 7. 进程完成后的处理
    pythonProcess.on('close', (code: number) => {
        if (code === 0) {
            // 使用轮询方式检查表2数据（最多等待10秒）
            let checkCount = 0;
            const maxChecks = 10;
            const checkInterval = 1000;
            
            const checkTable2 = () => {
                const impact = db.prepare('SELECT * FROM rain_flood_impact WHERE rain_event_id = ?').get(id);
                if (impact) {
                    sendResponse(true, '深度搜索完成，已生成影响评估报告和表2数据');
                } else {
                    checkCount++;
                    if (checkCount < maxChecks) {
                        setTimeout(checkTable2, checkInterval);
                    } else {
                        // 超过最大等待时间，返回错误
                        sendResponse(false, '深度搜索执行完成，但未找到生成的表2数据...');
                    }
                }
            };
            checkTable2();
        } else {
            sendResponse(false, `深度搜索执行失败（退出码: ${code}）`);
        }
    });
    
    // 8. 设置2分钟超时
    const timeout = setTimeout(() => {
        if (!pythonProcess.killed) {
            pythonProcess.kill();
            sendResponse(false, '深度搜索超时（超过2分钟）');
        }
    }, 2 * 60 * 1000);
});
```

---

## 3. Python：deep_search.py 入口

**文件：`apps/api/scripts/deep_search.py` (行95-321)**

```python
def main():
    parser = argparse.ArgumentParser(description="深度搜索流程脚本")
    parser.add_argument("--json", type=str, help="从JSON创建事件")
    args = parser.parse_args()
    
    if args.json:
        # 从JSON创建事件
        event_data = json.loads(args.json)
        event = create_event_from_dict(event_data)
        
        # 执行搜索流程
        workflow = SearchWorkflow()
        context = workflow.run_for_event(event)
        
        # 保存日志
        detailed_logger.save_to_file()
        logger.info("处理完成！事件ID: %s", context.rain_event.event_id)
```

---

## 4. Python：SearchWorkflow 执行流程

**文件：`search/orchestrator/workflow.py` (行65-115)**

```python
def run_for_event(self, event: RainEvent) -> EventContext:
    """针对单个降雨事件执行完整流程。"""
    context = EventContext(rain_event=event)
    
    # 步骤1：地理信息解析
    context.location_profile = self._resolve_location(event)
    
    # 步骤2：查询计划生成
    context.query_plan = self._build_query_plan(context)
    
    # 步骤3：数据采集
    context.raw_contents = self._collect_sources(context)
    
    # 步骤4：LLM处理（关键步骤）
    if total_items > 0:
        context.processed_summary = self._process_contents(context)
    else:
        # 没有数据时，跳过LLM处理
        context.processed_summary = {}
    
    # 步骤5：生成报告
    context.reports = self._generate_reports(context)
    
    return context
```

---

## 5. Python：LLM处理并填充表2

**文件：`search/orchestrator/workflow.py` (行172-228)**

```python
def _process_contents(self, context: EventContext) -> Dict[str, Any]:
    """使用 LLM 处理内容（完全 LLM 驱动）。"""
    # 1. 创建LLM处理器
    processor = LLMProcessor(self.config)
    result = processor.process(context)
    
    # 2. 填充表2（rain_flood_impact）
    try:
        # 2.1 获取数据库路径
        db_file = self.config.DB_FILE or "apps/database/dev.db"
        if not Path(db_file).is_absolute():
            project_root = Path(__file__).resolve().parents[2]
            db_file = str(project_root / db_file)
        
        # 2.2 从表1获取完整数据
        event_id_from_context = context.rain_event.event_id
        rain_event_data = get_rain_event_from_db(db_file, event_id_from_context)
        
        if not rain_event_data:
            logger.error("无法从数据库表1获取事件数据: %s", event_id_from_context)
        else:
            # 2.3 确保result中有extraction字段
            if not result.get("extraction"):
                result["extraction"] = {"timeline": [], "impact": {}}
            
            # 2.4 填充表2
            success = fill_rain_flood_impact_table(
                db_path=db_file,
                rain_event=rain_event_data,  # 传入表1的完整数据
                llm_result=result,
            )
            
            if success:
                logger.info("✅ 表2数据填充成功: rain_event_id=%s", table1_id)
            else:
                logger.warning("⚠️  表2数据填充失败: %s", table1_id)
    except Exception as e:
        logger.exception("填充表2数据时出错: %s", e)
    
    return result
```

---

## 6. Python：fill_rain_flood_impact_table 写入表2

**文件：`search/llm/db_writer.py` (行92-206)**

```python
def fill_rain_flood_impact_table(
    db_path: str,
    rain_event: Dict[str, Any],  # 表1数据
    llm_result: Dict[str, Any],   # LLM处理结果
) -> bool:
    """填充表2（rain_flood_impact）数据。"""
    try:
        # 1. 从表1获取ID（直接复制）
        table1_id = rain_event.get("id")
        rain_event_id = table1_id
        
        # 2. 提取LLM结果
        validation = llm_result.get("validation", {})
        extraction = llm_result.get("extraction", {})
        impact = extraction.get("impact", {})
        timeline = extraction.get("timeline", [])
        
        # 3. 从表1复制基础字段
        country = rain_event.get("country")
        province = rain_event.get("province")
        city = rain_event.get("city")
        time = rain_event.get("date")  # 直接复制date字段
        
        # 4. 计算影响级别
        transport_level = calculate_transport_impact_level(impact.get("transport"))
        economy_level = calculate_economy_impact_level(impact.get("economy"))
        safety_level = calculate_safety_impact_level(impact.get("safety"))
        level = calculate_overall_level(transport_level, economy_level, safety_level)
        
        # 5. 准备其他字段
        timeline_data = json.dumps(timeline, ensure_ascii=False)
        source_count = len(validation.get("relevant_items", []))
        detail_file = f"search_outputs/{date_dir}/{rain_event_id}_report.md"
        
        # 6. 插入或更新表2
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO rain_flood_impact (
                rain_event_id, time, level,
                country, province, city,
                transport_impact_level, economy_impact_level, safety_impact_level,
                timeline_data, source_count, detail_file,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(rain_event_id) DO UPDATE SET ...
        """, (rain_event_id, time, level, ...))
        
        conn.commit()
        conn.close()
        
        logger.info("✅ 表2数据已填充: rain_event_id=%s", rain_event_id)
        return True
        
    except Exception as e:
        logger.exception("填充表2数据失败: %s", e)
        return False
```

---

## 关键检查点

### 为什么可能找不到表2数据？

1. **LLM处理失败**
   - `processor.process(context)` 抛出异常
   - 异常被捕获，但 `result` 可能为空或不完整

2. **数据库写入失败**
   - `fill_rain_flood_impact_table()` 返回 `False`
   - 数据库文件不存在或不可写
   - SQL执行失败（表结构不匹配等）

3. **没有找到相关内容**
   - 数据采集返回空结果
   - LLM验证后没有相关项
   - `extraction` 为空，但仍应填充表2（已修复）

4. **数据库路径错误**
   - `get_rain_event_from_db()` 找不到表1数据
   - `fill_rain_flood_impact_table()` 使用错误的数据库路径

5. **ID不匹配**
   - 表1的ID与传入的ID不一致
   - 已修复：直接使用表1的ID

---

## 调试建议

1. **查看Python进程的stderr输出**
   - 后端会返回 `stderr.substring(0, 1000)` 用于调试

2. **检查日志文件**
   - Python脚本会输出详细日志
   - 查看 `search_outputs/` 目录下的日志文件

3. **验证数据库**
   - 检查 `apps/database/dev.db` 是否存在
   - 检查表1中是否有对应的事件记录
   - 检查表2是否真的没有数据

4. **检查LLM配置**
   - 验证 `.env` 文件中的 LLM API Key
   - 检查是否有API调用限制或错误

