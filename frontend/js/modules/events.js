/**
 * 事件管理模块 - 基于 rain_event 表
 */

/**
 * 获取 i18n 翻译函数（支持参数替换）
 */
function getI18n() {
    if (typeof t === 'function') {
        return (key, params) => {
            const text = t(key);
            if (params) {
                return Object.keys(params).reduce((str, k) => str.replace(`{${k}}`, params[k]), text);
            }
            return text;
        };
    }
    return (key, params) => {
        let text = key;
        if (params) {
            Object.keys(params).forEach(k => text = text.replace(`{${k}}`, params[k]));
        }
        return text;
    };
}

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
            const i18n = getI18n();
            throw new Error(errorData.error || i18n('search.error.loadFailed'));
        }
        
        const data = await res.json();
        
        if (!data.success) {
            throw new Error(data.error || '查询失败');
        }
        
        const i18n = getI18n();
        
        if (!data.details || data.details.length === 0) {
            const dateRangeText = dateFrom === dateTo ? dateFrom : `${dateFrom} ${i18n('common.to')} ${dateTo}`;
            statusEl.textContent = i18n('message.noEventsFound', { dateFrom, dateTo }) + (country ? ` (${i18n('message.countryFilter', { country })})` : '');
            listEl.style.display = 'none';
            return;
        }
        
        const stats = data.stats;
        const pagination = data.pagination || {};
        const dateRangeText = dateFrom === dateTo ? dateFrom : `${dateFrom} ${i18n('common.to')} ${dateTo}`;
        
        // 显示分页信息
        const pageInfo = pagination.total ? 
            i18n('message.pageInfo', { page: pagination.page, totalPages: pagination.totalPages, showing: data.details.length, total: pagination.total }) : 
            i18n('message.showingOnly', { count: data.details.length });
        statusEl.textContent = i18n('message.foundEvents', { count: stats.totalEvents, dateRange: dateRangeText }) + 
            (country ? ` (${i18n('message.countryFilter', { country })})` : '') + 
            ` | ${pageInfo} | ${i18n('message.searchedCount', { count: stats.totalSearched })}, ${i18n('message.unsearchedCount', { count: stats.totalUnsearched })}` +
            (stats.totalNeedResearch ? `, ${i18n('message.needResearchCount', { count: stats.totalNeedResearch })}` : '');
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
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.date')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.country')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.province')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.city')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.coordinates')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.value')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.threshold')}</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.searchStatus')}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.details.forEach((event, index) => {
            let searchedStatus;
            if (event.searched === 1) {
                searchedStatus = `<span style="color: #27ae60; font-weight: bold;">✅ ${i18n('table.status.searched')}</span>`;
            } else if (event.searched === 2) {
                searchedStatus = `<span style="color: #f39c12; font-weight: bold;">⚠️ ${i18n('table.status.needResearch')}</span>`;
            } else {
                searchedStatus = `<span style="color: #e74c3c; font-weight: bold;">⏳ ${i18n('table.status.unsearched')}</span>`;
            }
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
                    <td style="padding: 12px; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${event.province || ''}">${(event.province || '-').split('/')[0].trim()}</td>
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
                        <label style="font-size: 14px; color: #666;">${i18n('pagination.itemsPerPage')}</label>
                        <select id="pageSizeSelect" style="padding: 8px 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; cursor: pointer;">
                            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                            <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                        </select>
                        <span style="font-size: 14px; color: #666;">${i18n('pagination.items')}</span>
                    </div>
                    ${showPaginationButtons ? `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 14px; color: #666;">
                            ${i18n('pagination.pageInfoWithTotal', { page: pagination.page, totalPages: pagination.totalPages, total: pagination.total })}
                        </span>
                        <button id="btnFirstPage" ${pagination.page === 1 ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${pagination.page === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${pagination.page === 1 ? 'disabled' : ''}>${i18n('pagination.firstPage')}</button>
                        <button id="btnPrevPage" ${!pagination.hasPrev ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${!pagination.hasPrev ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${!pagination.hasPrev ? 'disabled' : ''}>${i18n('pagination.prevPage')}</button>
                        <button id="btnNextPage" ${!pagination.hasNext ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${!pagination.hasNext ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${!pagination.hasNext ? 'disabled' : ''}>${i18n('pagination.nextPage')}</button>
                        <button id="btnLastPage" ${pagination.page === pagination.totalPages ? 'disabled' : ''} 
                            style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${pagination.page === pagination.totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                            ${pagination.page === pagination.totalPages ? 'disabled' : ''}>${i18n('pagination.lastPage')}</button>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="font-size: 14px; color: #666;">${i18n('pagination.jumpTo')}</span>
                            <input type="number" id="pageJumpInput" min="1" max="${pagination.totalPages}" value="${pagination.page}" 
                                style="width: 60px; padding: 8px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; text-align: center;">
                            <button id="btnJumpPage" 
                                style="padding: 8px 15px; border: 1px solid #667eea; border-radius: 5px; background: #667eea; color: white; cursor: pointer; font-size: 14px;">${i18n('pagination.jump')}</button>
                        </div>
                    </div>
                    ` : `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 14px; color: #666;">
                            ${i18n('pagination.totalItems', { count: pagination.total })} ${i18n('pagination.allDisplayed')}
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
                            const i18n = typeof t === 'function' ? t : (key, params) => {
                                let text = key;
                                if (params) Object.keys(params).forEach(k => text = text.replace(`{${k}}`, params[k]));
                                return text;
                            };
                            alert(i18n('form.enterPageNumber', { max: pagination.totalPages }));
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
        const i18n = typeof t === 'function' ? t : (key) => key;
        statusEl.textContent = i18n('search.error.loadFailed') + ': ' + e.message;
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
    const i18n = typeof t === 'function' ? t : (key) => key;
    content.innerHTML = `<div style="text-align: center; padding: 20px;"><div class="spinner"></div><p>${i18n('common.loading')}</p></div>`;
    
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
        const isSearched = data.searched === true; // 根据后端返回的 searched 字段判断
        
        let html = '';
        
        if (isSearched) {
            // 已搜索：显示表2（rain_flood_impact）的内容
            // 计算级别颜色
            const getLevelColor = (level) => {
                if (!level) return '#666';
                if (level >= 4) return '#e74c3c'; // 红色 - 严重
                if (level >= 3) return '#f39c12'; // 橙色 - 中等
                if (level >= 2) return '#f1c40f'; // 黄色 - 轻微
                return '#27ae60'; // 绿色 - 低
            };
            
            const getLevelText = (level) => {
                if (!level) return i18n('common.na');
                if (level >= 4) return `${i18n('detail.impact.levelSevere')} (4${i18n('detail.impact.levelN')})`;
                if (level >= 3) return `${i18n('detail.impact.levelMedium')} (3${i18n('detail.impact.levelN')})`;
                if (level >= 2) return `${i18n('detail.impact.levelMild')} (2${i18n('detail.impact.levelN')})`;
                return `${i18n('detail.impact.levelLow')} (1${i18n('detail.impact.levelN')})`;
            };
            
            const getImpactLevelColor = (level) => {
                if (!level) return '#95a5a6';
                if (level >= 4) return '#e74c3c';
                if (level >= 3) return '#f39c12';
                if (level >= 2) return '#f1c40f';
                return '#27ae60';
            };
            
            html = `
                <div style="margin-bottom: 30px;">
                    <h4 style="color: #1e3c72; margin-bottom: 20px; border-bottom: 2px solid #667eea; padding-bottom: 8px; font-size: 18px;">${i18n('detail.impact.impactAssessment')}</h4>
                    
                    <!-- 基本信息卡片 -->
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; margin-bottom: 20px; color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">${i18n('detail.field.eventId')}</div>
                                <div style="font-size: 16px; font-weight: 600;">${event.rain_event_id || i18n('common.na')}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">${i18n('detail.field.time')}</div>
                                <div style="font-size: 16px; font-weight: 600;">${event.time || i18n('common.na')}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">${i18n('detail.field.country')}</div>
                                <div style="font-size: 16px; font-weight: 600;">${event.country || i18n('common.na')}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">${i18n('detail.field.province')}</div>
                                <div style="font-size: 16px; font-weight: 600;">${(event.province || i18n('common.na')).split('/')[0].trim()}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 5px;">${i18n('detail.field.city')}</div>
                                <div style="font-size: 16px; font-weight: 600;">${event.city || i18n('common.na')}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 影响级别卡片 -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                        <!-- 整体影响级别 -->
                        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 5px solid ${getLevelColor(event.level)}; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; color: #666; margin-bottom: 8px; font-weight: 500;">${i18n('detail.impact.level')}</div>
                            <div style="font-size: 28px; font-weight: bold; color: ${getLevelColor(event.level)}; margin-bottom: 5px;">${event.level || i18n('common.na')}</div>
                            <div style="font-size: 14px; color: #666;">${getLevelText(event.level)}</div>
                        </div>
                        
                        <!-- 交通影响级别 -->
                        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 5px solid ${getImpactLevelColor(event.transport_impact_level)}; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; color: #666; margin-bottom: 8px; font-weight: 500;">${i18n('detail.impact.transportImpact')}</div>
                            <div style="font-size: 28px; font-weight: bold; color: ${getImpactLevelColor(event.transport_impact_level)}; margin-bottom: 5px;">${event.transport_impact_level !== null && event.transport_impact_level !== undefined ? event.transport_impact_level : i18n('common.na')}</div>
                            <div style="font-size: 14px; color: #666;">${event.transport_impact_level !== null && event.transport_impact_level !== undefined ? getLevelText(event.transport_impact_level) : ''}</div>
                        </div>
                        
                        <!-- 经济影响级别 -->
                        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 5px solid ${getImpactLevelColor(event.economy_impact_level)}; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; color: #666; margin-bottom: 8px; font-weight: 500;">${i18n('detail.impact.economyImpact')}</div>
                            <div style="font-size: 28px; font-weight: bold; color: ${getImpactLevelColor(event.economy_impact_level)}; margin-bottom: 5px;">${event.economy_impact_level !== null && event.economy_impact_level !== undefined ? event.economy_impact_level : i18n('common.na')}</div>
                            <div style="font-size: 14px; color: #666;">${event.economy_impact_level !== null && event.economy_impact_level !== undefined ? getLevelText(event.economy_impact_level) : ''}</div>
                        </div>
                        
                        <!-- 安全影响级别 -->
                        <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 5px solid ${getImpactLevelColor(event.safety_impact_level)}; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div style="font-size: 13px; color: #666; margin-bottom: 8px; font-weight: 500;">${i18n('detail.impact.safetyImpact')}</div>
                            <div style="font-size: 28px; font-weight: bold; color: ${getImpactLevelColor(event.safety_impact_level)}; margin-bottom: 5px;">${event.safety_impact_level !== null && event.safety_impact_level !== undefined ? event.safety_impact_level : i18n('common.na')}</div>
                            <div style="font-size: 14px; color: #666;">${event.safety_impact_level !== null && event.safety_impact_level !== undefined ? getLevelText(event.safety_impact_level) : ''}</div>
                        </div>
                    </div>
                    
                    <!-- 其他信息 -->
                    <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                            <div>
                                <div style="font-size: 13px; color: #666; margin-bottom: 5px; font-weight: 500;">${i18n('detail.impact.sourceCount')}</div>
                                <div style="font-size: 18px; font-weight: 600; color: #2c3e50;">${event.source_count !== null && event.source_count !== undefined ? event.source_count : i18n('common.na')}</div>
                            </div>
                            <div>
                                <div style="font-size: 13px; color: #666; margin-bottom: 5px; font-weight: 500;">${i18n('detail.impact.detailFile')}</div>
                                <div style="font-size: 14px; color: #2c3e50; word-break: break-all;">${event.detail_file || i18n('common.na')}</div>
                            </div>
                            <div>
                                <div style="font-size: 13px; color: #666; margin-bottom: 5px; font-weight: 500;">${i18n('detail.field.createdAt')}</div>
                                <div style="font-size: 14px; color: #2c3e50;">${event.created_at || i18n('common.na')}</div>
                            </div>
                            <div>
                                <div style="font-size: 13px; color: #666; margin-bottom: 5px; font-weight: 500;">${i18n('detail.field.updatedAt')}</div>
                                <div style="font-size: 14px; color: #2c3e50;">${event.updated_at || i18n('common.na')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // 显示时间线数据
            if (event.timeline_data && Array.isArray(event.timeline_data) && event.timeline_data.length > 0) {
                html += `
                    <div style="margin-bottom: 20px;">
                        <h4 style="color: #1e3c72; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px;">${i18n('detail.impact.timelineData')}</h4>
                        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 5px; padding: 10px;">
                `;
                event.timeline_data.forEach((item, index) => {
                    html += `
                        <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                            <div style="font-weight: bold; color: #667eea; margin-bottom: 5px;">${item.time_slot || i18n('common.na')}</div>
                            <div style="margin-top: 5px; color: #333;">${item.highlights || i18n('common.na')}</div>
                            ${item.events && Array.isArray(item.events) && item.events.length > 0 ? `
                                <div style="margin-top: 5px; font-size: 12px; color: #666;">
                                    ${i18n('detail.impact.events')}: ${item.events.join(', ')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
                html += `</div></div>`;
            }
        } else {
            // 未搜索：显示表1（rain_event）的内容
            const i18n = getI18n();
            html = `
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #1e3c72; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px;">${i18n('detail.section.basicInfo')}</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold; width: 150px;">${i18n('detail.field.eventId')}</td><td style="padding: 8px;">${event.id}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.date')}</td><td style="padding: 8px;">${event.date}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.country')}</td><td style="padding: 8px;">${event.country || i18n('common.na')}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.province')}</td><td style="padding: 8px;">${(event.province || i18n('common.na')).split('/')[0].trim()}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.city')}</td><td style="padding: 8px;">${event.city || i18n('common.na')}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.coordinates')}</td><td style="padding: 8px;">${event.latitude && event.longitude ? `${event.latitude}, ${event.longitude}` : i18n('common.na')}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.value')}</td><td style="padding: 8px;"><span style="color: ${event.value && event.threshold && event.value > event.threshold ? '#e74c3c' : '#3498db'}; font-weight: bold;">${event.value !== null && event.value !== undefined ? event.value.toFixed(2) : i18n('common.na')}</span></td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.threshold')}</td><td style="padding: 8px;">${event.threshold !== null && event.threshold !== undefined ? event.threshold.toFixed(2) : i18n('common.na')}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.fileName')}</td><td style="padding: 8px;">${event.file_name || i18n('common.na')}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('detail.field.sequence')}</td><td style="padding: 8px;">${event.seq !== null && event.seq !== undefined ? event.seq : i18n('common.na')}</td></tr>
                        <tr><td style="padding: 8px; background: #f8f9fa; font-weight: bold;">${i18n('table.header.searchStatus')}</td><td style="padding: 8px;"><span style="color: #e74c3c; font-weight: bold;">${i18n('table.status.unsearched')}</span></td></tr>
                    </table>
                </div>
                <div style="margin-bottom: 20px;">
                    <button id="btnStartDeepSearch" style="background: ${event.searched === 2 ? '#f39c12' : '#667eea'}; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;">
                        ${event.searched === 2 ? '🔄' : '🔍'} ${i18n('button.startDeepSearch')}
                    </button>
                    <div style="margin-top: 10px; font-size: 12px; color: #666;">
                        ${i18n('detail.hint.deepSearchHint')}
                    </div>
                </div>
            `;
        }
        
        content.innerHTML = html;
        
        // 绑定深度搜索按钮（仅未搜索时显示）
        if (!isSearched) {
            const btnStartDeepSearch = document.getElementById('btnStartDeepSearch');
            if (btnStartDeepSearch) {
                btnStartDeepSearch.addEventListener('click', async function() {
                    const i18n = typeof t === 'function' ? t : (key, params) => {
                        let text = key;
                        if (params) Object.keys(params).forEach(k => text = text.replace(`{${k}}`, params[k]));
                        return text;
                    };
                    // 弹出确认框（使用自定义居中对话框）
                    const confirmed = await customConfirm(i18n('search.deepSearch.confirm', { id: event.id }));
                    
                    if (!confirmed) {
                        return;
                    }
                    
                    // 禁用按钮，显示加载状态
                    btnStartDeepSearch.disabled = true;
                    btnStartDeepSearch.textContent = i18n('search.deepSearch.searching');
                    btnStartDeepSearch.style.background = '#95a5a6';
                    
                    let searchRes = null; // 在外部声明，确保在catch中可用
                    try {
                        // 调用后端API触发深度搜索（设置4分钟超时，因为搜索需要30秒-1分钟）
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 4 * 60 * 1000); // 4分钟超时
                        
                        try {
                            searchRes = await fetch(`/events/rain/${encodeURIComponent(eventId)}/deep-search`, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json; charset=utf-8',
                                    'Accept': 'application/json; charset=utf-8'
                                },
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);
                            console.log(`[前端] 深度搜索响应状态: ${searchRes.status} ${searchRes.statusText}`);
                            console.log(`[前端] 响应Content-Type:`, searchRes.headers.get('Content-Type'));
                        } catch (fetchError) {
                            clearTimeout(timeoutId);
                            const i18n = getI18n();
                            if (fetchError.name === 'AbortError') {
                                throw new Error(i18n('search.deepSearch.timeout'));
                            }
                            throw fetchError;
                        }
                        
                        let searchData;
                        if (!searchRes || !searchRes.ok) {
                            // 非200状态码，尝试解析错误响应
                            console.error(`[前端] 深度搜索请求失败: status=${searchRes?.status}, statusText=${searchRes?.statusText}`);
                            try {
                                if (searchRes) {
                                    const errorText = await searchRes.text();
                                    console.error(`[前端] 错误响应内容:`, errorText);
                                    try {
                                        searchData = JSON.parse(errorText);
                                        console.error(`[前端] 解析后的错误数据:`, searchData);
                                        const i18n = getI18n();
                                        const error = new Error(searchData.error || i18n('search.deepSearch.failed'));
                                        error.responseData = searchData;
                                        throw error;
                                    } catch (jsonError) {
                                        // 如果不是JSON，直接使用文本
                                        const i18n = typeof t === 'function' ? t : (key, params) => {
                                            let text = key;
                                            if (params) Object.keys(params).forEach(k => text = text.replace(`{${k}}`, params[k]));
                                            return text;
                                        };
                                        const error = new Error(errorText || i18n('search.deepSearch.failedWithStatus', { status: searchRes.status }));
                                        error.responseData = { error: errorText, raw_response: errorText };
                                        throw error;
                                    }
                                } else {
                                    const i18n = getI18n();
                                    throw new Error(i18n('search.deepSearch.requestFailed'));
                                }
                            } catch (parseError) {
                                console.error(`[前端] 解析错误响应失败:`, parseError);
                                if (searchRes) {
                                    const i18n = typeof t === 'function' ? t : (key, params) => {
                                        let text = key;
                                        if (params) Object.keys(params).forEach(k => text = text.replace(`{${k}}`, params[k]));
                                        return text;
                                    };
                                    throw new Error(`${i18n('search.deepSearch.failedWithStatus', { status: searchRes.status })}: ${searchRes.statusText}`);
                                } else {
                                    throw parseError;
                                }
                            }
                        }
                        
                        searchData = await searchRes.json();
                        
                        if (searchData.success) {
                            // 搜索成功，刷新详情面板（会显示表2内容）
                            await showRainEventDetails(eventId);
                            
                            // 刷新列表（保持当前页码和每页条数）
                            const listEl = document.getElementById('candidatesList');
                            if (listEl && listEl.style.display !== 'none') {
                                const dateFrom = document.getElementById('eventDateFrom')?.value;
                                const dateTo = document.getElementById('eventDateTo')?.value;
                                const country = document.getElementById('eventCountry')?.value || '';
                                if (dateFrom && dateTo) {
                                    await loadRainEvents(dateFrom, dateTo, country, currentPage, pageSize);
                                }
                            }
                            
                            const i18n = getI18n();
                            alert(i18n('search.deepSearch.completed'));
                        } else {
                            // 创建错误对象，包含完整的响应数据
                            const i18n = getI18n();
                            const error = new Error(searchData.error || i18n('search.deepSearch.failed'));
                            error.responseData = searchData; // 附加响应数据
                            throw error;
                        }
                    } catch (e) {
                        // 显示详细错误信息
                        const i18n = getI18n();
                        let errorMsg = i18n('search.deepSearch.failed') + ': ' + e.message;
                        let errorData = null;
                        
                        // 尝试获取错误详情
                        if (e.responseData) {
                            errorData = e.responseData;
                        } else if (searchRes) {
                            try {
                                errorData = await searchRes.json();
                            } catch (parseError) {
                                // 忽略解析错误
                            }
                        }
                        
                        // 如果有详细错误数据，显示关键信息
                        if (errorData) {
                            // 显示错误类型和堆栈（如果有）
                            if (errorData.error_type) {
                                errorMsg += `\n错误类型: ${errorData.error_type}`;
                            }
                            if (errorData.error_stack) {
                                errorMsg += '\n\n📋 错误堆栈：\n';
                                errorMsg += errorData.error_stack.split('\n').slice(0, 10).join('\n');
                            }
                            
                            if (errorData.key_logs) {
                                errorMsg += '\n\n📋 详细日志：\n';
                                if (errorData.key_logs.table2_fail && errorData.key_logs.table2_fail.length > 0) {
                                    errorMsg += '\n❌ 表2填充失败日志：\n';
                                    errorData.key_logs.table2_fail.forEach(log => {
                                        errorMsg += '  - ' + log + '\n';
                                    });
                                }
                                if (errorData.key_logs.errors && errorData.key_logs.errors.length > 0) {
                                    errorMsg += '\n❌ 错误日志（最后10条）：\n';
                                    errorData.key_logs.errors.forEach(log => {
                                        errorMsg += '  - ' + log + '\n';
                                    });
                                }
                                if (errorData.key_logs.warnings && errorData.key_logs.warnings.length > 0) {
                                    errorMsg += '\n⚠️ 警告日志（最后10条）：\n';
                                    errorData.key_logs.warnings.forEach(log => {
                                        errorMsg += '  - ' + log + '\n';
                                    });
                                }
                            }
                            if (errorData.key_errors && errorData.key_errors.length > 0) {
                                const i18n = getI18n();
                                errorMsg += `\n❌ ${i18n('common.error')}：\n`;
                                errorData.key_errors.forEach(log => {
                                    errorMsg += '  - ' + log + '\n';
                                });
                            }
                            if (errorData.stderr) {
                                errorMsg += '\n📄 完整错误输出（最后500字符）：\n';
                                errorMsg += errorData.stderr.substring(Math.max(0, errorData.stderr.length - 500));
                            }
                        }
                        
                        // 在控制台输出完整错误信息（方便调试）
                        console.error('深度搜索失败:', e);
                        if (errorData) {
                            console.error('错误详情:', errorData);
                            if (errorData.stdout) {
                                console.error('Python stdout:', errorData.stdout);
                            }
                            if (errorData.stderr) {
                                console.error('Python stderr:', errorData.stderr);
                            }
                        }
                        
                        // 使用alert显示错误（可以复制文本）
                        alert(errorMsg + '\n\n💡 提示：打开浏览器控制台（F12）可查看完整错误信息');
                        
                        btnStartDeepSearch.disabled = false;
                        btnStartDeepSearch.textContent = '🔍 开始深度搜索';
                        btnStartDeepSearch.style.background = '#667eea';
                    }
                });
            }
        }
    } catch (e) {
        content.innerHTML = `<div style="color: #e74c3c; padding: 20px; text-align: center;">加载失败: ${e.message}</div>`;
    }
}

/**
 * 加载最新事件（默认显示最新10条）
 */
async function loadLatestEvents() {
    const today = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 30); // 最近30天
    
    const dateFromStr = dateFrom.toISOString().substring(0, 10);
    const dateToStr = today.toISOString().substring(0, 10);
    
    try {
        // API默认按日期降序排序，获取第一页的10条数据
        const url = `/events/rain?date_from=${dateFromStr}&date_to=${dateToStr}&details=true&page=1&limit=10`;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error('加载失败');
        }
        
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || '加载失败');
        }
        
        const results = data.details || [];
        
        // 更新全局状态
        if (window.appState) {
            window.appState.updateQueryResults(results, results.length, {
                dateFrom: dateFromStr,
                dateTo: dateToStr,
                country: ''
            });
        }
        
        // 渲染列表
        renderEventsList(results, {
            dateFrom: dateFromStr,
            dateTo: dateToStr,
            country: ''
        });
        
        // 隐藏提示，显示列表
        const hintEl = document.getElementById('eventsQueryHint');
        const listEl = document.getElementById('candidatesList');
        if (hintEl) {
            hintEl.style.display = 'none';
        }
        if (listEl) {
            listEl.style.display = 'block';
        }
        
    } catch (error) {
        console.error('加载最新事件失败:', error);
        // 显示提示
        const hintEl = document.getElementById('eventsQueryHint');
        const listEl = document.getElementById('candidatesList');
        if (hintEl) {
            hintEl.style.display = 'block';
        }
        if (listEl) {
            listEl.style.display = 'none';
        }
    }
}

/**
 * 从全局状态渲染事件列表
 */
function renderEventsListFromGlobalState() {
    if (!window.appState) {
        // 如果没有全局状态，加载最新数据
        loadLatestEvents();
        return;
    }
    
    const query = window.appState.getState('query');
    const hintEl = document.getElementById('eventsQueryHint');
    const listEl = document.getElementById('candidatesList');
    
    // 检查是否已经查询过（通过检查 queryParams 是否存在且有 dateFrom 或 dateTo 属性）
    // 即使值为空字符串，只要属性存在就说明查询过
    const hasQueried = query.queryParams && ('dateFrom' in query.queryParams || 'dateTo' in query.queryParams);
    
    if (!query.results || query.results.length === 0) {
        // 如果已经查询过但没有结果，显示"没有数据"
        if (hasQueried) {
            if (hintEl) {
                const i18n = getI18n();
                hintEl.innerHTML = `<p>${i18n('events.hint.noData')}</p>`;
                hintEl.style.display = 'block';
            }
            if (listEl) {
                listEl.style.display = 'none';
            }
            // 清空表格
            const tableEl = document.getElementById('candidatesTable');
            if (tableEl) {
                tableEl.innerHTML = '';
            }
        } else {
            // 如果没有查询过，加载最新数据
            loadLatestEvents();
        }
        return;
    }
    
    // 如果有数据，显示列表（提示信息由 executeQueryForPage 处理，这里不隐藏）
    // 如果提示已经显示了查询成功信息，就保留；如果没有，就隐藏
    if (listEl) {
        listEl.style.display = 'block';
    }
    
    // 使用全局查询结果渲染列表（分页处理）
    renderEventsList(query.results, query.queryParams);
}

/**
 * 渲染事件列表（支持分页）
 */
function renderEventsList(results, queryParams) {
    const hintEl = document.getElementById('eventsQueryHint');
    const listEl = document.getElementById('candidatesList');
    
    if (!results || results.length === 0) {
        // 显示"没有数据"提示
        if (hintEl) {
            const i18n = getI18n();
            hintEl.innerHTML = `<p>${i18n('events.hint.noData')}</p>`;
            hintEl.style.display = 'block';
        }
        if (listEl) {
            listEl.style.display = 'none';
        }
        // 清空表格
        const tableEl = document.getElementById('candidatesTable');
        if (tableEl) {
            tableEl.innerHTML = '';
        }
        return;
    }
    
    const tableEl = document.getElementById('candidatesTable');
    if (!tableEl) return;
    
    // 分页处理
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedResults = results.slice(startIndex, endIndex);
    const totalPages = Math.ceil(results.length / pageSize);
    
    const i18n = typeof t === 'function' ? t : (key, params) => {
        let text = key;
        if (params) Object.keys(params).forEach(k => text = text.replace(`{${k}}`, params[k]));
        return text;
    };
    
    // 渲染表格
    let html = `
        <div style="overflow-x: auto; width: 100%;">
            <table style="width: 100%; min-width: 100%; border-collapse: collapse; table-layout: auto;">
                <thead style="background: #f8f9fa; position: sticky; top: 0;">
                    <tr>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.date')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.country')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.province')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.city')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.coordinates')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.value')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.threshold')}</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; white-space: nowrap;">${i18n('table.header.searchStatus')}</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    paginatedResults.forEach((event, index) => {
        let searchedStatus;
        if (event.searched === 1) {
            searchedStatus = `<span style="color: #27ae60; font-weight: bold;">✅ ${i18n('table.status.searched')}</span>`;
        } else if (event.searched === 2) {
            searchedStatus = `<span style="color: #f39c12; font-weight: bold;">⚠️ ${i18n('table.status.needResearch')}</span>`;
        } else {
            searchedStatus = `<span style="color: #e74c3c; font-weight: bold;">⏳ ${i18n('table.status.unsearched')}</span>`;
        }
        const valueColor = event.value && event.threshold && event.value > event.threshold ? '#e74c3c' : '#3498db';
        
        html += `
            <tr class="rain-event-row" data-id="${event.id}" data-index="${startIndex + index}" 
                style="border-bottom: 1px solid #dee2e6; cursor: pointer; transition: all 0.2s; background: white; border-left: 2px solid transparent;" 
                onmouseover="if(!this.classList.contains('selected')) this.style.background='#e8f4f8'" 
                onmouseout="if(!this.classList.contains('selected')) { this.style.background='white'; this.style.borderLeft='2px solid transparent'; }">
                <td style="padding: 12px; white-space: nowrap;">${event.date}</td>
                <td style="padding: 12px; white-space: nowrap;">${event.country || '-'}</td>
                <td style="padding: 12px; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${event.province || ''}">${(event.province || '-').split('/')[0].trim()}</td>
                <td style="padding: 12px; white-space: nowrap; max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${event.city || ''}">${event.city || '-'}</td>
                <td style="padding: 12px; white-space: nowrap;">${event.latitude ? `${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)}` : '-'}</td>
                <td style="padding: 12px; white-space: nowrap;"><span style="color: ${valueColor}; font-weight: bold;">${event.value !== null && event.value !== undefined ? event.value.toFixed(2) : '-'}</span></td>
                <td style="padding: 12px; white-space: nowrap;">${event.threshold !== null && event.threshold !== undefined ? event.threshold.toFixed(2) : '-'}</td>
                <td style="padding: 12px; white-space: nowrap;">${searchedStatus}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    
    // 添加分页控件（始终显示，即使只有一页也显示每页条数选择器）
    html += `
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <label style="font-size: 14px; color: #666;">${i18n('pagination.itemsPerPage')}</label>
                <select id="pageSizeSelect" style="padding: 8px 12px; border: 2px solid #ddd; border-radius: 5px; font-size: 14px; cursor: pointer;">
                    <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
                </select>
                <span style="font-size: 14px; color: #666;">${i18n('pagination.items')}</span>
            </div>
            ${results.length > pageSize ? `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 14px; color: #666;">
                    ${i18n('pagination.pageInfoWithTotal', { page: currentPage, totalPages: totalPages, total: results.length })}
                </span>
                <button id="btnPrevPage" ${currentPage === 1 ? 'disabled' : ''} 
                    style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${currentPage === 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    ${currentPage === 1 ? 'disabled' : ''}>${i18n('pagination.prevPage')}</button>
                <button id="btnNextPage" ${currentPage >= totalPages ? 'disabled' : ''} 
                    style="padding: 8px 15px; border: 1px solid #ddd; border-radius: 5px; background: white; cursor: pointer; font-size: 14px; ${currentPage >= totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}"
                    ${currentPage >= totalPages ? 'disabled' : ''}>${i18n('pagination.nextPage')}</button>
            </div>
            ` : `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 14px; color: #666;">
                    ${i18n('pagination.totalItems', { count: results.length })} ${i18n('pagination.allDisplayed')}
                </span>
            </div>
            `}
        </div>
    `;
    
    tableEl.innerHTML = html;
    
    // 绑定每页条数选择器
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', function() {
            const newPageSize = parseInt(this.value);
            pageSize = newPageSize;
            currentPage = 1; // 重置到第一页
            renderEventsListFromGlobalState();
        });
    }
    
    // 绑定分页按钮
    if (results.length > pageSize) {
        const btnPrev = document.getElementById('btnPrevPage');
        const btnNext = document.getElementById('btnNextPage');
        
        if (btnPrev && !btnPrev.disabled) {
            btnPrev.addEventListener('click', function() {
                currentPage--;
                renderEventsListFromGlobalState();
            });
        }
        
        if (btnNext && !btnNext.disabled) {
            btnNext.addEventListener('click', function() {
                currentPage++;
                renderEventsListFromGlobalState();
            });
        }
    }
    
    // 绑定行点击事件
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
            showRainEventDetails(encodeURIComponent(eventId));
        });
    });
}

/**
 * 初始化事件管理模块
 */
function initEvents() {
    // 设置默认日期（如果存在旧的事件日期输入框）
    initEventDates();
    
    // 刷新按钮（使用全局查询结果）
    const btnRefresh = document.getElementById('btnRefreshEvents');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', function() {
            renderEventsListFromGlobalState();
        });
    }
    
    // 监听全局查询更新事件
    document.addEventListener('globalQuery:updated', function() {
        // 如果当前在事件查询页面，自动刷新列表
        if (window.router && window.router.getCurrentRoute()?.path === 'events') {
            renderEventsListFromGlobalState();
        }
    });
    
    // 监听页面显示事件
    document.addEventListener('page:show', function(e) {
        if (e.detail.pageId === 'page-events') {
            // 页面显示时，检查全局状态并渲染
            setTimeout(() => {
                renderEventsListFromGlobalState();
            }, 100);
        }
    });
    
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

// 将函数暴露到全局作用域，以便其他模块可以直接调用
window.renderEventsListFromGlobalState = renderEventsListFromGlobalState;
window.renderEventsList = renderEventsList;
