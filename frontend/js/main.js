/**
 * 主入口文件
 * 初始化所有模块
 */

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 初始化国际化（最先初始化）
    if (typeof initI18n === 'function') {
        initI18n();
    }
    
    // 初始化路由系统
    if (window.router) {
        window.router.register('dashboard', 'page-dashboard', '总览仪表盘');
        window.router.register('events', 'page-events', '事件查询');
        window.router.register('interpolation', 'page-interpolation', '降雨导入');
        window.router.register('analysis', 'page-analysis', '数据分析');
        window.router.register('management', 'page-management', '数据管理');
        window.router.init('dashboard');
    }
    
    // 初始化全局查询
    if (typeof initGlobalQuery === 'function') {
        initGlobalQuery();
    }
    
    // 初始化统计数据（如果当前在仪表盘页面）
    if (window.router && window.router.getCurrentRoute()?.path === 'dashboard') {
        if (typeof initDashboard === 'function') {
            setTimeout(() => initDashboard(), 300);
        } else if (typeof loadStats === 'function') {
            loadStats();
        }
    }
    
    // 初始化事件管理模块
    if (typeof initEvents === 'function') {
        initEvents();
    }
    
    // 初始化降雨导入模块
    if (typeof initInterpolation === 'function') {
        initInterpolation();
    }
    
    // 监听全局查询更新事件
    document.addEventListener('globalQuery:updated', function() {
        // 如果当前在事件查询页面，刷新事件列表
        if (window.router && window.router.getCurrentRoute()?.path === 'events') {
            if (window.appState) {
                const query = window.appState.getState('query');
                if (query.results && query.results.length > 0) {
                    // 使用全局查询结果更新事件列表
                    updateEventsListFromGlobalQuery(query.results, query.queryParams);
                }
            }
        }
    });
    
    // 页面加载时自动初始化地图并加载GeoJSON（仅在降雨导入页面）
    setTimeout(() => {
        // 初始化地图（如果不存在）
        if (typeof initMap === 'function') {
            if (!window.map && !window.mapInitializing) {
                // 只在降雨导入页面初始化地图
                const interpolationPage = document.getElementById('page-interpolation');
                if (interpolationPage && interpolationPage.style.display !== 'none') {
                    initMap();
                    
                    // 等待地图初始化完成后再加载GeoJSON
                    const waitForMapAndLoadGeoJSON = (attempts = 0) => {
                        if (window.map && window.map._leaflet_id) {
                            // 地图已初始化，加载GeoJSON
                            if (typeof loadDefaultGeoJSON === 'function') {
                                loadDefaultGeoJSON();
                            }
                        } else if (attempts < 10) {
                            // 等待200ms后重试
                            setTimeout(() => waitForMapAndLoadGeoJSON(attempts + 1), 200);
                        } else {
                            console.warn('等待地图初始化超时，仍尝试加载GeoJSON');
                            if (typeof loadDefaultGeoJSON === 'function') {
                                loadDefaultGeoJSON();
                            }
                        }
                    };
                    
                    waitForMapAndLoadGeoJSON();
                }
            }
        }
    }, 500);
    
    // 监听页面切换事件，在降雨导入页面显示时初始化地图
    document.addEventListener('page:show', function(e) {
        if (e.detail.pageId === 'page-interpolation') {
            setTimeout(() => {
                if (typeof initMap === 'function' && !window.map && !window.mapInitializing) {
                    initMap();
                    if (typeof loadDefaultGeoJSON === 'function') {
                        setTimeout(() => loadDefaultGeoJSON(), 300);
                    }
                }
            }, 100);
        }
    });
});

/**
 * 从全局查询结果更新事件列表
 */
function updateEventsListFromGlobalQuery(results, queryParams) {
    // 调用 events.js 中的函数来更新列表
    if (typeof renderEventsList === 'function') {
        renderEventsList(results, queryParams);
    } else if (typeof renderEventsListFromGlobalState === 'function') {
        renderEventsListFromGlobalState();
    }
}

