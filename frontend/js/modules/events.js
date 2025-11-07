/**
 * 事件管理模块 - 基于 rain_event 表
 */

// 设置默认日期范围（今天）
function initEventDates() {
    const today = new Date().toISOString().substring(0, 10);
    const dateFromEl = document.getElementById('eventDateFrom');
    const dateToEl = document.getElementById('eventDateTo');
    if (dateFromEl) dateFromEl.value = today;
    if (dateToEl) dateToEl.value = today;
}

// 分页状态
let currentPage = 1;
let pageSize = 10; // 默认20条

/**
 * 加载降雨事件（支持日期范围和国家筛选）
 */
async function loadRainEvents(dateFrom, dateTo, country, page = 1, limit = null) {
    const statusEl = document.getElementById('eventsStatus');
    const listEl = document.getElementById('candidatesList');
    const tableEl = document.getElementById('candidatesTable');
    
    if (!statusEl || !listEl || !tableEl) return;
    
    // 使用传入的参数或全局状态
    const usePage = page || currentPage;
    const useLimit = limit || pageSize;
    currentPage = usePage;
    pageSize = useLimit;
    
    statusEl.textContent = '🔍 查询中...';
    
    try {
        let url = `/events/rain?date_from=${dateFrom}&date_to=${dateTo}&details=true&page=${usePage}&limit=${useLimit}`;
        if (country && country.trim() !== '') {
            url += `&country=${encodeURIComponent(country)}`;
        }
        
        const res = await fetch(url);
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || '查询失败');
        }
        
        const data = await res.json();
        
        if (!data.success) {
            throw new Error(data.error || '查询失败');
        }
        
        if (!data.details || data.details.length === 0) {
            statusEl.textContent = `未找到 ${dateFrom} 至 ${dateTo} 期间的事件${country ? `（国家：${country}）` : ''}`;
            listEl.style.display = 'none';
            return;
        }
        
        const stats = data.stats;
        const pagination = data.pagination || {};
        const dateRangeText = dateFrom === dateTo ? dateFrom : `${dateFrom} 至 ${dateTo}`;
        
        // 显示分页信息
        const pageInfo = pagination.total ? 
            `第 ${pagination.page}/${pagination.totalPages} 页，显示 ${data.details.length} 条，共 ${pagination.total} 条` : 
            `显示 ${data.details.length} 条`;
        statusEl.textContent = `找到 ${stats.totalEvents} 个事件（${dateRangeText}）${country ? `，国家：${country}` : ''} | ${pageInfo} | 已搜索：${stats.totalSearched}，未搜索：${stats.totalUnsearched}`;
        listEl.style.display = 'block';
        
        // 重置布局为全宽（隐藏详情面板）
        const container = document.getElementById('eventsContainer');
        const detailsPanel = document.getElementById('eventDetailsPanel');
        if (container) {
            container.style.gridTemplateColumns = '1fr';
        }
        if (detailsPanel) {
            detailsPanel.style.display = 'none';
        }
        
        // 渲染表格 - 使用完整宽度和选中状态
        let html = `
            <div style="overflow-x: auto; width: 100%;">
                <table style="width: 100%; min-width: 100%; border-collapse: collapse; table-layout: auto;">
                    <thead style="background: #f8f9fa; position: sticky; top: 0;">
                        <tr>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">日期</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">国家</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">省份</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">城市</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">坐标</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">数值</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">阈值</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">搜索状态</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.details.forEach((event, index) => {
            const searchedStatus = event.searched === 1 ? 
                '<span style="color: #27ae60; font-weight: bold;">✅ 已搜索</span>' : 
                '<span style="color: #e74c3c; font-weight: bold;">⏳ 未搜索</span>';
            const valueColor = event.value && event.threshold && event.value > event.threshold ? '#e74c3c' : '#3498db';
            
            // 确保使用正确的ID（URL编码）
            const eventId = encodeURIComponent(event.id);
            
            html += `
                <tr class="rain-event-row" data-id="${event.id}" data-index="${index}" 
                    style="border-bottom: 1px solid #dee2e6; cursor: pointer; transition: all 0.2s; background: white; border-left: 2px solid transparent;" 
                    onmouseover="if(!this.classList.contains('selected')) this.style.background='#e8f4f8'" 
                    onmouseout="if(!this.classList.contains('selected')) { this.style.background='white'; this.style.borderLeft='2px solid transparent'; }">
                    <td style="padding: 12px; white-space: nowrap;">${event.date}</td>
                    <td style="padding: 12px; white-space: nowrap;">${event.country || '-'}</td>
                    <td style="padding: 12px; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${event.province || ''}">${event.province || '-'}</td>
                    <td style="padding: 12px; white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${event.city || ''}">${event.city || '-'}</td>
                    <td style="padding: 12px; white-space: nowrap;">${event.latitude ? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}` : '-'}</td>
                    <td style="padding: 12px; white-space: nowrap;"><span style="color: ${valueColor}; font-weight: bold;">${event.value !== null && event.value !== undefined ? event.value.toFixed(2) : '-'}</span></td>
                    <td style="padding: 12px; white-space: nowrap;">${event.threshold !== null && event.threshold !== undefined ? event.threshold.toFixed(2) : '-'}</td>
                    <td style="padding: 12px; white-space: nowrap;">${searchedStatus}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
        
        // 添加分页控件（只要有分页信息就显示，即使只有一页也显示每页条数选择器）
        if (pagination && pagination.total) {
            const showPaginationButtons = pagination.totalPages > 1;
            html += `
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="font-size: 14px; color: #666;">每页显示:</label>
                        <select id="pageSizeSelect" style="padding: 8px 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; cursor: pointer;">
                            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                            <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                        </select>
                        <span style="font-size: 14px; color: #666;">条</span>
                    </div>
                    ${showPaginationButtons ? `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 14px; color: #666;">
                            第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.total} 条
                        </span>
                        <button id="btnFirstPage" ${pagination.page === 1 ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${pagination.page === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${pagination.page === 1 ? 'disabled' : ''}>首页</button>
                        <button id="btnPrevPage" ${!pagination.hasPrev ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${!pagination.hasPrev ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${!pagination.hasPrev ? 'disabled' : ''}>上一页</button>
                        <button id="btnNextPage" ${!pagination.hasNext ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${!pagination.hasNext ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${!pagination.hasNext ? 'disabled' : ''}>下一页</button>
                        <button id="btnLastPage" ${pagination.page === pagination.totalPages ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${pagination.page === pagination.totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${pagination.page === pagination.totalPages ? 'disabled' : ''}>末页</button>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="font-size: 14px; color: #666;">跳转到:</span>
                            <input type="number" id="pageJumpInput" min="1" max="${pagination.totalPages}" value="${pagination.page}" 
                                style="width: 60px; padding: 8px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; text-align: center;">
                            <button id="btnJumpPage" 
                                style="padding: 8px 15px; border: 1px solid #667eea; border-radius: 5px; background: #667eea; color: white; cursor: pointer; font-size: 14px;">跳转</button>
                        </div>
                    </div>
                    ` : `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 14px; color: #666;">
                            共 ${pagination.total} 条（全部显示）
                        </span>
                    </div>
                    `}
                </div>
            `;
        }
        
        tableEl.innerHTML = html;
        
        // 绑定分页控件事件（只要有分页信息就绑定）
        if (pagination && pagination.total) {
            // 每页条数选择（始终可用）
            const pageSizeSelect = document.getElementById('pageSizeSelect');
            if (pageSizeSelect) {
                pageSizeSelect.addEventListener('change', function() {
                    const newPageSize = parseInt(this.value);
                    pageSize = newPageSize;
                    currentPage = 1; // 重置到第一页
                    loadRainEvents(dateFrom, dateTo, country, 1, newPageSize);
                });
            }
            
            // 分页按钮（仅在有多页时显示和绑定）
            if (pagination.totalPages > 1) {
                // 首页
                const btnFirstPage = document.getElementById('btnFirstPage');
                if (btnFirstPage && !btnFirstPage.disabled) {
                    btnFirstPage.addEventListener('click', function() {
                        loadRainEvents(dateFrom, dateTo, country, 1, pageSize);
                    });
                }
                
                // 上一页
                const btnPrevPage = document.getElementById('btnPrevPage');
                if (btnPrevPage && !btnPrevPage.disabled) {
                    btnPrevPage.addEventListener('click', function() {
                        loadRainEvents(dateFrom, dateTo, country, pagination.page - 1, pageSize);
                    });
                }
                
                // 下一页
                const btnNextPage = document.getElementById('btnNextPage');
                if (btnNextPage && !btnNextPage.disabled) {
                    btnNextPage.addEventListener('click', function() {
                        loadRainEvents(dateFrom, dateTo, country, pagination.page + 1, pageSize);
                    });
                }
                
                // 末页
                const btnLastPage = document.getElementById('btnLastPage');
                if (btnLastPage && !btnLastPage.disabled) {
                    btnLastPage.addEventListener('click', function() {
                        loadRainEvents(dateFrom, dateTo, country, pagination.totalPages, pageSize);
                    });
                }
                
                // 跳转
                const btnJumpPage = document.getElementById('btnJumpPage');
                const pageJumpInput = document.getElementById('pageJumpInput');
                if (btnJumpPage && pageJumpInput) {
                    btnJumpPage.addEventListener('click', function() {
                        const targetPage = parseInt(pageJumpInput.value);
                        if (targetPage >= 1 && targetPage <= pagination.totalPages) {
                            loadRainEvents(dateFrom, dateTo, country, targetPage, pageSize);
                        } else {
                            alert(`请输入 1 到 ${pagination.totalPages} 之间的页码`);
                        }
                    });
                    
                    // 回车跳转
                    pageJumpInput.addEventListener('keypress', function(e) {
                        if (e.key === 'Enter') {
                            btnJumpPage.click();
                        }
                    });
                }
            }
        }
        
        // 点击行查看详情，并添加选中状态
        let selectedRow = null;
        document.querySelectorAll('.rain-event-row').forEach(row => {
            row.addEventListener('click', function() {
                // 移除之前的选中状态
                if (selectedRow) {
                    selectedRow.classList.remove('selected');
                    selectedRow.style.background = 'white';
                    selectedRow.style.borderLeft = '2px solid transparent';
                }
                
                // 添加新的选中状态
                this.classList.add('selected');
                this.style.background = '#d4edda';
                this.style.borderLeft = '4px solid #28a745';
                selectedRow = this;
                
                const eventId = this.getAttribute('data-id');
                // 使用 encodeURIComponent 确保特殊字符正确编码
                showRainEventDetails(encodeURIComponent(eventId));
            });
        });
    } catch (e) {
        statusEl.textContent = '查询失败: ' + e.message;
        listEl.style.display = 'none';
    }
}

/**
 * 显示降雨事件详情
 */
async function showRainEventDetails(eventId) {
    const panel = document.getElementById('eventDetailsPanel');
    const content = document.getElementById('eventDetailsContent');
    const container = document.getElementById('eventsContainer');
    
    if (!panel || !content) return;
    
    // 调整布局为一半一半
    if (container) {
        container.style.gridTemplateColumns = '1fr 1fr';
    }
    panel.style.display = 'block';
    content.innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner"></div><p>加载中...</p></div>';
    
    try {
        // 确保 eventId 已经正确编码（如果前端传入的是原始ID，需要编码）
        // 如果已经是编码后的，直接使用；否则再次编码
        const encodedId = eventId.includes('%') ? eventId : encodeURIComponent(eventId);
        const res = await fetch(`/events/rain/${encodedId}`);
        if (!res.ok) throw new Error('获取详情失败');
        
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || '获取详情失败');
        }
        
        const event = data.event;
        
        // 格式化显示
        let html = `
            <div style="margin-bottom: 20px;">
                <h4 style="color: #1e3c72; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px;">基本信息</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold; width: 150px;">事件ID</td><td style="padding: 8px;">${event.id}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">日期</td><td style="padding: 8px;">${event.date}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">国家</td><td style="padding: 8px;">${event.country || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">省份</td><td style="padding: 8px;">${event.province || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">城市</td><td style="padding: 8px;">${event.city || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">坐标</td><td style="padding: 8px;">${event.latitude && event.longitude ? `${event.latitude}, ${event.longitude}` : 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">数值</td><td style="padding: 8px;"><span style="color: ${event.value && event.threshold && event.value > event.threshold ? '#e74c3c' : '#3498db'}; font-weight: bold;">${event.value !== null && event.value !== undefined ? event.value.toFixed(2) : 'N/A'}</span></td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">阈值</td><td style="padding: 8px;">${event.threshold !== null && event.threshold !== undefined ? event.threshold.toFixed(2) : 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">文件名</td><td style="padding: 8px;">${event.file_name || 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">序号</td><td style="padding: 8px;">${event.seq !== null && event.seq !== undefined ? event.seq : 'N/A'}</td></tr>
                    <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">搜索状态</td><td style="padding: 8px;"><span style="color: ${event.searched ? '#27ae60' : '#e74c3c'}; font-weight: bold;">${event.searchedText || (event.searched ? '已搜索' : '未搜索')}</span></td></tr>
                </table>
            </div>
        `;
        
        // 添加搜索状态切换按钮
        html += `
            <div style="margin-bottom: 20px;">
                <button id="btnToggleSearch" style="background: ${event.searched ? '#e74c3c' : '#27ae60'}; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    ${event.searched ? '标记为未搜索' : '标记为已搜索'}
                </button>
            </div>
        `;
        
        content.innerHTML = html;
        
        // 绑定搜索状态切换按钮
        const btnToggleSearch = document.getElementById('btnToggleSearch');
        if (btnToggleSearch) {
            btnToggleSearch.addEventListener('click', async function() {
                const newSearched = !event.searched;
                btnToggleSearch.disabled = true;
                btnToggleSearch.textContent = '更新中...';
                
                try {
                    const updateRes = await fetch(`/events/rain/${eventId}/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ searched: newSearched })
                    });
                    
                    if (!updateRes.ok) throw new Error('更新失败');
                    
                    const updateData = await updateRes.json();
                    if (updateData.success) {
                        // 重新加载详情
                        await showRainEventDetails(eventId);
                        // 如果列表可见，刷新列表（保持当前页码和每页条数）
                        const listEl = document.getElementById('candidatesList');
                        if (listEl && listEl.style.display !== 'none') {
                            const dateFrom = document.getElementById('eventDateFrom')?.value;
                            const dateTo = document.getElementById('eventDateTo')?.value;
                            const country = document.getElementById('eventCountry')?.value || '';
                            if (dateFrom && dateTo) {
                                await loadRainEvents(dateFrom, dateTo, country, currentPage, pageSize);
                            }
                        }
                    }
                } catch (e) {
                    alert('更新失败: ' + e.message);
                    btnToggleSearch.disabled = false;
                    btnToggleSearch.textContent = event.searched ? '标记为未搜索' : '标记为已搜索';
                }
            });
        }
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
            const dateFrom = document.getElementById('eventDateFrom')?.value;
            const dateTo = document.getElementById('eventDateTo')?.value;
            const country = document.getElementById('eventCountry')?.value || '';
            
            if (!dateFrom || !dateTo) {
                alert('请选择开始日期和结束日期');
                return;
            }
            if (dateFrom > dateTo) {
                alert('开始日期不能晚于结束日期');
                return;
            }
            // 重置到第一页
            currentPage = 1;
            await loadRainEvents(dateFrom, dateTo, country, 1, pageSize);
        });
    }
    
    // 刷新按钮（重新查询）
    const btnRefreshEvents = document.getElementById('btnRefreshEvents');
    if (btnRefreshEvents) {
        btnRefreshEvents.addEventListener('click', async function() {
            const dateFrom = document.getElementById('eventDateFrom')?.value;
            const dateTo = document.getElementById('eventDateTo')?.value;
            const country = document.getElementById('eventCountry')?.value || '';
            
            if (!dateFrom || !dateTo) {
                alert('请选择开始日期和结束日期');
                return;
            }
            if (dateFrom > dateTo) {
                alert('开始日期不能晚于结束日期');
                return;
            }
            // 重置到第一页
            currentPage = 1;
            await loadRainEvents(dateFrom, dateTo, country, 1, pageSize);
        });
    }
    
    // 关闭详情面板
    const btnClose = document.getElementById('btnCloseDetails');
    if (btnClose) {
        btnClose.addEventListener('click', function() {
            const panel = document.getElementById('eventDetailsPanel');
            const container = document.getElementById('eventsContainer');
            const selectedRow = document.querySelector('.rain-event-row.selected');
            
            if (panel) {
                panel.style.display = 'none';
            }
            
            // 恢复全宽布局
            if (container) {
                container.style.gridTemplateColumns = '1fr';
            }
            
            // 清除选中状态
            if (selectedRow) {
                selectedRow.classList.remove('selected');
                selectedRow.style.background = 'white';
                selectedRow.style.borderLeft = '2px solid transparent';
            }
        });
    }
}
