/**
 * 统计数据模块
 */

let trendChart = null;
let distributionChart = null;

/**
 * 获取翻译函数（如果可用）
 */
function getI18n() {
    if (typeof t === 'function') {
        return t;
    }
    // 如果i18n未加载，返回默认函数
    return (key) => key;
}

/**
 * 加载统计数据（不包含图表，用于仪表盘）
 */
async function loadStatsWithoutCharts() {
    try {
        const response = await fetch('/analysis/summary');
        if (response.ok) {
            const data = await response.json();
            // 更新统计显示
            const totalEl = document.getElementById('totalRecords');
            const processedEl = document.getElementById('processedRecords');
            const avgRiskEl = document.getElementById('averageRisk');
            const maxLevelEl = document.getElementById('maxWaterLevel');
            
            if (totalEl) totalEl.textContent = data.total_records ?? 0;
            if (processedEl) processedEl.textContent = data.processed_records ?? 0;
            if (avgRiskEl) avgRiskEl.textContent = (data.average_risk ?? 0).toFixed(2);
            // 使用 max_risk_level 或 max_rainfall，优先显示风险级别
            if (maxLevelEl) {
                maxLevelEl.textContent = (data.max_risk_level ?? data.max_rainfall ?? 0).toFixed(2);
            }
        } else {
            console.warn('加载统计数据失败:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

/**
 * 加载统计数据（包含图表，用于数据分析页面）
 */
async function loadStats() {
    try {
        const response = await fetch('/analysis/summary');
        if (response.ok) {
            const data = await response.json();
            // 加载图表数据
            await loadChartData();
        } else {
            console.warn('加载统计数据失败:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

/**
 * 加载图表数据
 */
async function loadChartData() {
    try {
        // 获取趋势数据（最近7天）
        const trendResponse = await fetch('/python/rain/stats');
        if (trendResponse.ok) {
            const trendData = await trendResponse.json();
            if (trendData.success && trendData.byDate) {
                initTrendChart(trendData.byDate);
            }
        }
        
        // 获取分布数据
        const distResponse = await fetch('/analysis/summary');
        if (distResponse.ok) {
            const distData = await distResponse.json();
            initDistributionChart(distData);
        }
    } catch (error) {
        console.error('加载图表数据失败:', error);
    }
}

/**
 * 初始化趋势图表
 */
function initTrendChart(dataByDate) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    // 准备数据（取最近7条）
    const recentData = dataByDate.slice(0, 7).reverse();
    const labels = recentData.map(item => {
        const date = new Date(item.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const values = recentData.map(item => item.count);
    
    // 销毁旧图表
    if (trendChart) {
        trendChart.destroy();
    }
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '事件数量',
                data: values,
                borderColor: 'rgb(52, 152, 219)',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

/**
 * 初始化分布图表
 */
function initDistributionChart(data) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    
    const processed = data.processed_records ?? 0;
    const unprocessed = data.unprocessed_records ?? 0;
    
    // 销毁旧图表
    if (distributionChart) {
        distributionChart.destroy();
    }
    
    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['已处理', '未处理'],
            datasets: [{
                data: [processed, unprocessed],
                backgroundColor: [
                    'rgb(39, 174, 96)',
                    'rgb(149, 165, 166)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * 加载最近事件列表
 */
async function loadRecentEvents() {
    const container = document.getElementById('recentEventsList');
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="loading-placeholder">加载中...</div>';
        
        // 获取最近的事件（通过API）
        const response = await fetch('/python/rain/list?limit=10&page=1');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
                renderRecentEvents(data.data);
            } else {
                container.innerHTML = '<div class="empty-state">暂无最近事件</div>';
            }
        } else {
            // 如果API不可用，显示提示
            container.innerHTML = '<div class="empty-state">无法加载最近事件</div>';
        }
    } catch (error) {
        console.error('加载最近事件失败:', error);
        container.innerHTML = '<div class="empty-state">加载失败，请稍后重试</div>';
    }
}

/**
 * 渲染最近事件列表
 */
function renderRecentEvents(events) {
    const container = document.getElementById('recentEventsList');
    if (!container) return;
    
    if (events.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无最近事件</div>';
        return;
    }
    
    const i18n = getI18n();
    const unknownDate = i18n('common.unknownDate') || '未知日期';
    const unknownRegion = i18n('common.unknownRegion') || '未知地区';
    const rainfallLabel = i18n('map.popup.rainfall') || '降雨量';
    const processed = i18n('table.status.searched') || '已处理';
    const needResearch = i18n('table.status.needResearch') || '需复查';
    const unprocessed = i18n('table.status.unsearched') || '未处理';
    
    const html = events.map(event => {
        const date = event.date ? new Date(event.date).toLocaleDateString() : unknownDate;
        const province = event.province || event.city || unknownRegion;
        const country = event.country || '';
        const value = event.value ? event.value.toFixed(1) : '-';
        const searched = event.searched === 1 ? `✅ ${processed}` : event.searched === 2 ? `🔄 ${needResearch}` : `⏳ ${unprocessed}`;
        
        return `
            <div class="recent-event-item" data-event-id="${event.id || ''}">
                <div class="event-item-header">
                    <div class="event-item-title">${country ? country + ' - ' : ''}${province}</div>
                    <div class="event-item-date">${date}</div>
                </div>
                <div class="event-item-meta">
                    <span>📊 ${rainfallLabel}: ${value}mm</span>
                    <span>${searched}</span>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
    
    // 添加点击事件
    container.querySelectorAll('.recent-event-item').forEach(item => {
        item.addEventListener('click', function() {
            const eventId = this.dataset.eventId;
            if (eventId && window.router) {
                // 切换到事件查询页面
                window.router.navigate('events');
                // 可以在这里触发事件详情显示
            }
        });
    });
}

/**
 * 初始化仪表盘功能
 */
function initDashboard() {
    // 加载统计数据（不加载图表）
    loadStatsWithoutCharts();
    
    // 加载最近事件
    loadRecentEvents();
    
    // 初始化地图
    initDashboardMap();
    
    // 加载国家列表
    loadCountryList();
    
    // 刷新按钮
    const refreshBtn = document.getElementById('btnRefreshRecent');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadRecentEvents();
        });
    }
    
    // 地图刷新按钮
    const mapRefreshBtn = document.getElementById('btnRefreshMap');
    if (mapRefreshBtn) {
        mapRefreshBtn.addEventListener('click', () => {
            loadMapData();
        });
    }
    
    // 国家筛选器
    const countryFilter = document.getElementById('dashboardCountryFilter');
    if (countryFilter) {
        countryFilter.addEventListener('change', () => {
            loadMapData();
        });
    }
}

/**
 * 初始化数据分析页面
 */
function initAnalysisPage() {
    // 加载统计数据（包含图表）
    loadStats();
}


/**
 * 初始化仪表盘地图
 */
function initDashboardMap() {
    const mapDiv = document.getElementById('dashboardMap');
    if (!mapDiv) return;
    
    // 检查地图是否已初始化
    if (window.dashboardMap && window.dashboardMap._leaflet_id) {
        // 地图已存在，只刷新数据
        loadMapData();
        return;
    }
    
    try {
        // 初始化地图（使用仪表盘专用的地图实例）
        // 初始视图使用更高的缩放级别，显示更放大的界面
        const dashboardMap = L.map('dashboardMap', {
            preferCanvas: false
        }).setView([55, 10], 4); // 欧洲中心位置，缩放级别8（更放大）
        
        window.dashboardMap = dashboardMap;
        
        // 添加底图图层
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(dashboardMap);
        
        // 等待地图渲染完成
        setTimeout(() => {
            if (dashboardMap) {
                dashboardMap.invalidateSize();
                // 加载地图数据
                loadMapData();
            }
        }, 300);
    } catch (error) {
        console.error('初始化仪表盘地图失败:', error);
    }
}

/**
 * 加载地图数据点
 */
async function loadMapData() {
    const dashboardMap = window.dashboardMap;
    if (!dashboardMap) return;
    
    const countryFilter = document.getElementById('dashboardCountryFilter');
    const selectedCountry = countryFilter ? countryFilter.value : '';
    
    try {
        // 构建查询URL
        let url = '/python/rain/list?limit=500&page=1'; // 限制500条以避免性能问题
        
        // 如果有国家筛选，需要先获取所有数据再筛选（因为API可能不支持国家筛选）
        const response = await fetch(url);
        if (!response.ok) {
            console.warn('加载地图数据失败');
            return;
        }
        
        const data = await response.json();
        if (!data.success || !data.data) {
            return;
        }
        
        // 筛选数据
        let events = data.data;
        if (selectedCountry && selectedCountry.trim() !== '') {
            events = events.filter(event => {
                const country = (event.country || '').toLowerCase();
                const filter = selectedCountry.toLowerCase();
                return country.includes(filter) || country === filter;
            });
        }
        
        // 清除旧标记
        if (window.dashboardMapMarkers) {
            window.dashboardMapMarkers.clearLayers();
        } else {
            window.dashboardMapMarkers = L.layerGroup();
            window.dashboardMapMarkers.addTo(dashboardMap);
        }
        
        // 添加新标记
        events.forEach((event, index) => {
            if (event.latitude && event.longitude) {
                const lat = parseFloat(event.latitude);
                const lng = parseFloat(event.longitude);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    // 根据值设置颜色
                    let color = '#3498db'; // 默认蓝色
                    const value = event.value ? parseFloat(event.value) : 0;
                    if (value > 100) {
                        color = '#e74c3c'; // 红色：高值
                    } else if (value > 50) {
                        color = '#f39c12'; // 橙色：中等值
                    }
                    
                    const marker = L.circleMarker([lat, lng], {
                        radius: 6,
                        fillColor: color,
                        color: '#fff',
                        weight: 2,
                        fillOpacity: 0.7
                    });
                    
                    // 添加弹出信息（使用翻译）
                    const i18n = getI18n();
                    const unknownRegion = i18n('common.unknownRegion') || '未知地区';
                    const countryLabel = i18n('map.popup.country') || '国家';
                    const dateLabel = i18n('map.popup.date') || '日期';
                    const rainfallLabel = i18n('map.popup.rainfall') || '降雨量';
                    
                    let popupContent = `<div style="min-width: 150px;">`;
                    popupContent += `<strong>${event.province || event.city || unknownRegion}</strong><br>`;
                    if (event.country) popupContent += `${countryLabel}: ${event.country}<br>`;
                    if (event.date) popupContent += `${dateLabel}: ${event.date}<br>`;
                    if (event.value) popupContent += `${rainfallLabel}: ${event.value.toFixed(1)}mm<br>`;
                    popupContent += `</div>`;
                    
                    marker.bindPopup(popupContent);
                    window.dashboardMapMarkers.addLayer(marker);
                }
            }
        });
        
    } catch (error) {
        console.error('加载地图数据失败:', error);
    }
}

/**
 * 加载国家列表到筛选器
 */
async function loadCountryList() {
    const countryFilter = document.getElementById('dashboardCountryFilter');
    if (!countryFilter) return;
    
    try {
        const response = await fetch('/python/rain/stats');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.byProvince) {
                // 从省份数据中提取国家（如果有的话）
                // 或者从事件数据中提取
                const response2 = await fetch('/python/rain/list?limit=1000&page=1');
                if (response2.ok) {
                    const data2 = await response2.json();
                    if (data2.success && data2.data) {
                        // 提取唯一国家
                        const countries = [...new Set(data2.data
                            .map(e => e.country)
                            .filter(c => c && c.trim() !== ''))].sort();
                        
                        // 清空现有选项（保留"所有国家"）
                        const i18n = getI18n();
                        const allCountriesText = i18n('country.allCountries') || '所有国家';
                        countryFilter.innerHTML = `<option value="">${allCountriesText}</option>`;
                        
                        // 添加国家选项
                        countries.forEach(country => {
                            const option = document.createElement('option');
                            option.value = country;
                            option.textContent = country;
                            countryFilter.appendChild(option);
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('加载国家列表失败:', error);
    }
}

// 监听页面显示事件，当仪表盘显示时初始化
document.addEventListener('page:show', function(e) {
    if (e.detail.pageId === 'page-dashboard') {
        // 延迟初始化，确保DOM已渲染
        setTimeout(() => {
            initDashboard();
            // 如果地图已初始化，调整大小
            if (window.dashboardMap) {
                setTimeout(() => {
                    window.dashboardMap.invalidateSize();
                }, 200);
            }
        }, 100);
    } else if (e.detail.pageId === 'page-analysis') {
        // 初始化数据分析页面
        setTimeout(() => {
            initAnalysisPage();
        }, 100);
    }
});

// 监听语言切换事件，更新地图弹窗和下拉框
window.addEventListener('languageChanged', function() {
    // 如果地图已加载，重新加载地图数据以更新弹窗文本
    if (window.dashboardMap && window.dashboardMapMarkers) {
        loadMapData();
    }
    // 重新加载国家列表以更新"所有国家"选项
    loadCountryList();
    // 重新加载最近事件列表
    loadRecentEvents();
});

