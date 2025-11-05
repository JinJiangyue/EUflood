/**
 * 事件管理模块
 */

// 设置默认日期范围（今天）
function initEventDates() {
    const today = new Date().toISOString().substring(0, 10);
    const dateFromEl = document.getElementById('eventDateFrom');
    const dateToEl = document.getElementById('eventDateTo');
    if (dateFromEl) dateFromEl.value = today;
    if (dateToEl) dateToEl.value = today;
}

/**
 * 加载候选事件（支持日期范围）
 */
async function loadCandidates(dateFrom, dateTo, refresh) {
    const statusEl = document.getElementById('eventsStatus');
    const listEl = document.getElementById('candidatesList');
    const tableEl = document.getElementById('candidatesTable');
    
    if (!statusEl || !listEl || !tableEl) return;
    
    statusEl.textContent = refresh ? '🔄 正在重新抓取...' : '🔍 查询中...';
    
    try {
        const url = `/events/candidates?date_from=${dateFrom}&date_to=${dateTo}${refresh ? '&refresh=true' : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('查询失败');
        
        const data = await res.json();
        if (data.candidates.length === 0) {
            statusEl.textContent = `未找到 ${dateFrom} 至 ${dateTo} 期间的事件`;
            listEl.style.display = 'none';
            return;
        }
        
        const dateRangeText = dateFrom === dateTo ? dateFrom : `${dateFrom} 至 ${dateTo}`;
        statusEl.textContent = `找到 ${data.candidates.length} 个事件（${dateRangeText}）${data.cached ? '（来自缓存）' : ''}。采集：GDACS(${data.collected.gdacs}), Meteoalarm(${data.collected.meteoalarm})`;
        listEl.style.display = 'block';
        
        // 渲染表格
        let html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="background: #f8f9fa;">
                    <tr>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;"><input type="checkbox" id="selectAll" style="cursor: pointer;"></th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">国家</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">城市</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">时间</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">严重程度</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">来源</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">状态</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        data.candidates.forEach(c => {
            const severityColor = c.severity === 'high' || c.severity === 'extreme' ? '#e74c3c' : 
                                 c.severity === 'medium' ? '#f39c12' : '#3498db';
            const enriched = c.enriched ? '✅ 已整理' : '⏳ 待整理';
            html += `
                <tr class="candidate-row" data-id="${c.id}" style="border-bottom: 1px solid #dee2e6; cursor: pointer; transition: background 0.2s;" 
                    onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                    <td style="padding: 12px;" onclick="event.stopPropagation()"><input type="checkbox" value="${c.id}" style="cursor: pointer;"></td>
                    <td style="padding: 12px;">${c.country || '-'}</td>
                    <td style="padding: 12px;">${c.city || '-'}</td>
                    <td style="padding: 12px;">${c.time_from ? c.time_from.substring(0, 16) : c.event_date}</td>
                    <td style="padding: 12px;"><span style="color: ${severityColor}; font-weight: bold;">${c.severity || 'low'}</span></td>
                    <td style="padding: 12px;">${c.source}</td>
                    <td style="padding: 12px;">${enriched}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        tableEl.innerHTML = html;
        
        // 全选功能
        const selectAllEl = document.getElementById('selectAll');
        if (selectAllEl) {
            selectAllEl.addEventListener('change', function(e) {
                const checkboxes = document.querySelectorAll('#candidatesTable input[type="checkbox"]:not(#selectAll)');
                checkboxes.forEach(cb => cb.checked = e.target.checked);
            });
        }
        
        // 点击行查看详情
        document.querySelectorAll('.candidate-row').forEach(row => {
            row.addEventListener('click', function(e) {
                if (e.target.type === 'checkbox') return;
                const candidateId = this.getAttribute('data-id');
                showEventDetails(candidateId);
            });
        });
    } catch (e) {
        statusEl.textContent = '查询失败: ' + e.message;
        listEl.style.display = 'none';
    }
}

/**
 * 显示事件详情
 */
async function showEventDetails(candidateId) {
    const panel = document.getElementById('eventDetailsPanel');
    const content = document.getElementById('eventDetailsContent');
    
    if (!panel || !content) return;
    
    panel.style.display = 'block';
    content.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner"></div><p>加载中...</p></div>';
    
    try {
        const res = await fetch(`/events/${candidateId}/details`);
        if (!res.ok) throw new Error('获取详情失败');
        
        const data = await res.json();
        const candidate = data.candidate;
        const related = data.relatedRecords;
        
        // 格式化显示
        let html = `
            <div style="margin-bottom: 20px;">
                <h4 style="color: #1e3c72; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px;">基本信息</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold; width: 150px;">事件ID</td><td style="padding: 8px;">${candidate.id}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">国家</td><td style="padding: 8px;">${candidate.country || 'Unknown'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">城市</td><td style="padding: 8px;">${candidate.city || 'Unknown'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">坐标</td><td style="padding: 8px;">${candidate.latitude && candidate.longitude ? `${candidate.latitude}, ${candidate.longitude}` : 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">事件日期</td><td style="padding: 8px;">${candidate.event_date}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">开始时间</td><td style="padding: 8px;">${candidate.time_from || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">结束时间</td><td style="padding: 8px;">${candidate.time_to || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">严重程度</td><td style="padding: 8px;"><span style="color: ${candidate.severity === 'high' || candidate.severity === 'extreme' ? '#e74c3c' : candidate.severity === 'medium' ? '#f39c12' : '#3498db'}; font-weight: bold;">${candidate.severity || 'low'}</span></td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">等级</td><td style="padding: 8px;">${candidate.level || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">来源</td><td style="padding: 8px;">${candidate.source}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">来源URL</td><td style="padding: 8px;"><a href="${candidate.source_url || '#'}" target="_blank" style="color: #667eea;">${candidate.source_url || 'N/A'}</a></td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">标题</td><td style="padding: 8px;">${candidate.title || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">描述</td><td style="padding: 8px;">${candidate.description || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">状态</td><td style="padding: 8px;">${candidate.enriched ? '✅ 已整理' : '⏳ 待整理'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">创建时间</td><td style="padding: 8px;">${candidate.created_at || 'N/A'}</td></tr>
                </table>
            </div>
        `;
        
        // 原始数据
        if (candidate.raw_data) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #1e3c72; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px;">原始数据 (Raw Data)</h4>
                    <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px; max-height: 300px; overflow-y: auto;">${JSON.stringify(candidate.raw_data, null, 2)}</pre>
                </div>
            `;
        }
        
        // 相关记录统计
        if (related && related.count > 0) {
            html += `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #1e3c72; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px;">相关记录统计</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">相关记录数</td><td style="padding: 8px;">${related.count}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">平均置信度</td><td style="padding: 8px;">${(related.avg_confidence || 0).toFixed(2)}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">最大水位</td><td style="padding: 8px;">${related.max_water_level || 'N/A'}</td></tr>
                    </table>
                </div>
            `;
        }
        
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = `<div style="color: #e74c3c; padding: 20px; text-align: center;">加载失败: ${e.message}</div>`;
    }
}

/**
 * 初始化事件管理模块
 */
function initEvents() {
    // 设置默认日期
    initEventDates();
    
    // 事件查询按钮
    const btnQueryEvents = document.getElementById('btnQueryEvents');
    if (btnQueryEvents) {
        btnQueryEvents.addEventListener('click', async function() {
            const dateFrom = document.getElementById('eventDateFrom').value;
            const dateTo = document.getElementById('eventDateTo').value;
            if (!dateFrom || !dateTo) {
                alert('请选择开始日期和结束日期');
                return;
            }
            if (dateFrom > dateTo) {
                alert('开始日期不能晚于结束日期');
                return;
            }
            await loadCandidates(dateFrom, dateTo, false);
        });
    }
    
    // 刷新重抓按钮
    const btnRefreshEvents = document.getElementById('btnRefreshEvents');
    if (btnRefreshEvents) {
        btnRefreshEvents.addEventListener('click', async function() {
            const dateFrom = document.getElementById('eventDateFrom').value;
            const dateTo = document.getElementById('eventDateTo').value;
            if (!dateFrom || !dateTo) {
                alert('请选择开始日期和结束日期');
                return;
            }
            if (dateFrom > dateTo) {
                alert('开始日期不能晚于结束日期');
                return;
            }
            await loadCandidates(dateFrom, dateTo, true);
        });
    }
    
    // 整理选中事件按钮
    const btnEnrichSelected = document.getElementById('btnEnrichSelected');
    if (btnEnrichSelected) {
        btnEnrichSelected.addEventListener('click', async function() {
            const checkboxes = document.querySelectorAll('#candidatesTable input[type="checkbox"]:checked');
            if (checkboxes.length === 0) {
                alert('请至少选择一个事件');
                return;
            }
            const btn = document.getElementById('btnEnrichSelected');
            btn.disabled = true;
            btn.textContent = '🔄 整理中...';
            let success = 0;
            for (const checkbox of checkboxes) {
                const candidateId = checkbox.value;
                try {
                    const res = await fetch(`/events/${candidateId}/enrich`, { method: 'POST' });
                    if (res.ok) success++;
                } catch (e) {
                    console.error('整理失败:', e);
                }
            }
            alert(`已整理 ${success}/${checkboxes.length} 个事件`);
            btn.disabled = false;
            btn.textContent = '✅ 整理选中事件';
            if (typeof loadStats === 'function') {
                await loadStats();
            }
        });
    }
    
    // 关闭详情面板
    const btnClose = document.getElementById('btnCloseDetails');
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            const panel = document.getElementById('eventDetailsPanel');
            if (panel) {
                panel.style.display = 'none';
            }
        });
    }
}

