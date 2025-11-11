/**
 * 全局查询模块
 * 处理侧边栏的全局查询功能
 */

/**
 * 执行查询 API 调用
 */
async function fetchEventsData(dateFrom, dateTo, country) {
    let url = `/events/rain?date_from=${dateFrom}&date_to=${dateTo}&details=true&page=1&limit=1000`;
    if (country && country.trim() !== '') {
        url += `&country=${encodeURIComponent(country)}`;
    }
    
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error('查询失败');
    }
    
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || '查询失败');
    }
    
    const results = data.details || [];
    const totalCount = data.stats?.totalEvents || results.length;
    
    return { results, totalCount };
}

/**
 * 显示查询结果提示（在右侧或左侧）
 */
function showQueryResult(totalCount, country, isEventsPage) {
    const i18n = getI18n();
    const countryText = country ? ` (${country})` : '';
    
    if (isEventsPage) {
        // 在右侧显示
        const hintEl = document.getElementById('eventsQueryHint');
        if (hintEl) {
            if (totalCount > 0) {
                const successText = i18n('events.hint.querySuccess', { count: totalCount });
                hintEl.innerHTML = `<p style="color: #27ae60;">${successText}${countryText}</p>`;
            } else {
                hintEl.innerHTML = `<p>${i18n('events.hint.noData')}</p>`;
            }
            hintEl.style.display = 'block';
        }
    } else {
        // 在左侧显示
        const statusEl = document.getElementById('globalQueryStatus');
        if (statusEl) {
            const successText = i18n('events.hint.querySuccess', { count: totalCount });
            statusEl.textContent = `${successText}${countryText}`;
            statusEl.style.color = '#27ae60';
        }
    }
}

/**
 * 显示查询错误提示
 */
function showQueryError(error, isEventsPage) {
    if (isEventsPage) {
        const hintEl = document.getElementById('eventsQueryHint');
        if (hintEl) {
            hintEl.innerHTML = `<p style="color: #e74c3c;">❌ 查询失败：${error.message}</p>`;
            hintEl.style.display = 'block';
        }
        const statusEl = document.getElementById('globalQueryStatus');
        if (statusEl) {
            statusEl.textContent = '';
        }
    } else {
        const statusEl = document.getElementById('globalQueryStatus');
        if (statusEl) {
            statusEl.textContent = `❌ 查询失败：${error.message}`;
            statusEl.style.color = '#e74c3c';
        }
    }
}

/**
 * 初始化全局查询
 */
function initGlobalQuery() {
    // 设置默认日期（今天）
    const today = new Date().toISOString().substring(0, 10);
    const dateFromEl = document.getElementById('globalDateFrom');
    const dateToEl = document.getElementById('globalDateTo');
    if (dateFromEl) dateFromEl.value = today;
    if (dateToEl) dateToEl.value = today;
    
    // 快速日期选择按钮（页面上的）
    document.querySelectorAll('.quick-date-btn-page').forEach(btn => {
        btn.addEventListener('click', function() {
            const range = this.getAttribute('data-range');
            setQuickDateRangeForPage(range);
        });
    });
    
    // 查询按钮事件
    const btnQuery = document.getElementById('btnGlobalQuery');
    if (btnQuery) {
        btnQuery.addEventListener('click', async function() {
            await executeGlobalQuery();
        });
    }
    
    // 回车键查询
    const inputs = ['globalDateFrom', 'globalDateTo', 'globalCountry'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    executeGlobalQuery();
                }
            });
        }
    });
}

/**
 * 设置快速日期范围（用于页面上的按钮）
 */
function setQuickDateRangeForPage(range) {
    const today = new Date();
    let dateFrom, dateTo;
    
    switch(range) {
        case 'latest': {
            // 最新：直接请求后端“按日期倒序的前10条”
            const isEventsPage = window.router && window.router.getCurrentRoute()?.path === 'events';
            if (isEventsPage && typeof loadLatestEvents === 'function') {
                // 事件页：调用专用函数渲染前10条
                loadLatestEvents();
                return;
            }
            // 其它页面：仍然设置最近30天，但查询结果不在此页展示列表
            dateTo = new Date(today);
            dateFrom = new Date(today);
            dateFrom.setDate(dateFrom.getDate() - 30);
            break;
        }
        case 'today':
            // 今天
            dateFrom = new Date(today);
            dateTo = new Date(today);
            break;
        case 'week':
            // 本周：从本周一开始到今天
            dateTo = new Date(today);
            dateFrom = new Date(today);
            const dayOfWeek = dateFrom.getDay();
            const diff = dateFrom.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // 周一
            dateFrom.setDate(diff);
            break;
        case 'month':
            // 本月：从本月1号到今天
            dateTo = new Date(today);
            dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        default:
            return;
    }
    
    const dateFromStr = dateFrom.toISOString().substring(0, 10);
    const dateToStr = dateTo.toISOString().substring(0, 10);
    
    // 更新全局查询区域的日期（如果存在）
    const dateFromEl = document.getElementById('globalDateFrom');
    const dateToEl = document.getElementById('globalDateTo');
    if (dateFromEl) dateFromEl.value = dateFromStr;
    if (dateToEl) dateToEl.value = dateToStr;
    
    // 直接执行查询（不通过全局查询按钮）
    executeQueryForPage(dateFromStr, dateToStr);
}

/**
 * 为页面执行查询（直接查询并显示结果）
 */
async function executeQueryForPage(dateFrom, dateTo) {
    const country = document.getElementById('globalCountry')?.value || '';
    const isEventsPage = window.router && window.router.getCurrentRoute()?.path === 'events';
    
    // 更新状态
    if (window.appState) {
        window.appState.setQueryLoading(true);
        window.appState.setQueryParams(dateFrom, dateTo, country);
    }
    
    // 如果当前在事件查询页面，显示加载状态
    if (isEventsPage) {
        const hintEl = document.getElementById('eventsQueryHint');
        if (hintEl) {
            hintEl.innerHTML = '<p>🔍 查询中...</p>';
            hintEl.style.display = 'block';
        }
    }
    
    try {
        // 调用查询 API
        const { results, totalCount } = await fetchEventsData(dateFrom, dateTo, country);
        
        // 更新全局状态
        if (window.appState) {
            window.appState.updateQueryResults(results, totalCount, {
                dateFrom,
                dateTo,
                country
            });
        }
        
        // 显示查询结果
        showQueryResult(totalCount, country, isEventsPage);
        
        // 如果当前在事件查询页面，直接刷新列表
        if (isEventsPage) {
            if (window.renderEventsListFromGlobalState && typeof window.renderEventsListFromGlobalState === 'function') {
                window.renderEventsListFromGlobalState();
            } else {
                document.dispatchEvent(new CustomEvent('globalQuery:updated'));
            }
            
            // 清空左侧状态（避免重复提示）
            const statusEl = document.getElementById('globalQueryStatus');
            if (statusEl) {
                statusEl.textContent = '';
            }
        }
        
    } catch (error) {
        console.error('查询失败:', error);
        showQueryError(error, isEventsPage);
        
        if (window.appState) {
            window.appState.setQueryLoading(false);
        }
    }
}

/**
 * 执行全局查询
 */
async function executeGlobalQuery() {
    const dateFrom = document.getElementById('globalDateFrom')?.value;
    const dateTo = document.getElementById('globalDateTo')?.value;
    const country = document.getElementById('globalCountry')?.value || '';
    const statusEl = document.getElementById('globalQueryStatus');
    const btnQuery = document.getElementById('btnGlobalQuery');
    
    if (!dateFrom || !dateTo) {
        if (statusEl) {
            statusEl.textContent = '⚠️ 请选择日期范围';
            statusEl.style.color = '#e74c3c';
        }
        return;
    }
    
    if (dateFrom > dateTo) {
        if (statusEl) {
            statusEl.textContent = '⚠️ 开始日期不能晚于结束日期';
            statusEl.style.color = '#e74c3c';
        }
        return;
    }
    
    // 更新状态
    if (window.appState) {
        window.appState.setQueryLoading(true);
        window.appState.setQueryParams(dateFrom, dateTo, country);
    }
    
    // 更新UI
    if (btnQuery) {
        btnQuery.disabled = true;
        btnQuery.textContent = '🔄 查询中...';
    }
    if (statusEl) {
        statusEl.textContent = '🔍 正在查询...';
        statusEl.style.color = '#3498db';
    }
    
    try {
        // 调用查询 API
        const { results, totalCount } = await fetchEventsData(dateFrom, dateTo, country);
        
        // 更新全局状态
        if (window.appState) {
            window.appState.updateQueryResults(results, totalCount, {
                dateFrom,
                dateTo,
                country
            });
        }
        
        // 判断是否在事件查询页面
        const isEventsPage = window.router && window.router.getCurrentRoute()?.path === 'events';
        
        // 显示查询结果（在右侧和左侧都显示）
        if (isEventsPage) {
            showQueryResult(totalCount, country, true);
            // 触发事件页面刷新
            document.dispatchEvent(new CustomEvent('globalQuery:updated'));
        }
        // 在左侧显示状态（通过左侧按钮查询时）
        showQueryResult(totalCount, country, false);
        
    } catch (error) {
        console.error('全局查询失败:', error);
        const isEventsPage = window.router && window.router.getCurrentRoute()?.path === 'events';
        showQueryError(error, isEventsPage);
        
        if (window.appState) {
            window.appState.setQueryLoading(false);
        }
    } finally {
        if (btnQuery) {
            btnQuery.disabled = false;
            const i18n = getI18n();
            btnQuery.textContent = i18n('button.queryEvents') || '查询事件';
        }
    }
}

