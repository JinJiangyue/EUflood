/**
 * 数据管理模块（触发器检查、数据采集、处理等）
 */

/**
 * 初始化数据管理模块
 */
function initDataManagement() {
    // 触发器检查按钮
    const btnTrigger = document.getElementById('btnTrigger');
    if (btnTrigger) {
        btnTrigger.addEventListener('click', async function() {
            try {
                const btn = document.getElementById('btnTrigger');
                btn.disabled = true;
                btn.textContent = '🔄 检查中...';
                const res = await fetch('/trigger/check', { method: 'POST' });
                const j = await res.json();
                alert(`触发器检查完成：\n检查了 ${j.checked} 个位置\n触发了 ${j.triggered} 个事件`);
                if (typeof loadStats === 'function') {
                    await loadStats();
                }
                btn.disabled = false;
                btn.textContent = '🌧️ 触发器检查';
            } catch (e) {
                alert('触发器检查失败：' + e.message);
                const btn = document.getElementById('btnTrigger');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🌧️ 触发器检查';
                }
            }
        });
    }
    
    // 数据采集按钮
    const btnIngest = document.getElementById('btnIngest');
    if (btnIngest) {
        btnIngest.addEventListener('click', async function() {
            try {
                const res = await fetch('/ingestion/run', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ count: 10 }) 
                });
                const j = await res.json();
                alert('已采集示例数据：' + (j.inserted ?? 0) + ' 条');
                if (typeof loadStats === 'function') {
                    await loadStats();
                }
            } catch (e) {
                alert('采集失败');
            }
        });
    }
    
    // 数据处理按钮
    const btnProcess = document.getElementById('btnProcess');
    if (btnProcess) {
        btnProcess.addEventListener('click', async function() {
            try {
                const res = await fetch('/processing/run', { method: 'POST' });
                const j = await res.json();
                alert('已处理：' + (j.processed ?? 0) + ' 条');
                if (typeof loadStats === 'function') {
                    await loadStats();
                }
            } catch (e) {
                alert('处理失败');
            }
        });
    }
    
    // 刷新统计按钮
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', function() { 
            if (typeof loadStats === 'function') {
                loadStats();
            }
        });
    }
}

