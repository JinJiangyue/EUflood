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
    
    // 初始化统计数据
    if (typeof loadStats === 'function') {
        loadStats();
    }
    
    // 初始化搜索模块
    if (typeof initSearch === 'function') {
        initSearch();
    }
    
    // 初始化事件管理模块
    if (typeof initEvents === 'function') {
        initEvents();
    }
    
    // 初始化数据管理模块
    if (typeof initDataManagement === 'function') {
        initDataManagement();
    }
    
    // 初始化空间插值分析模块
    if (typeof initInterpolation === 'function') {
        initInterpolation();
    }
    
    // 页面加载时自动初始化地图并加载GeoJSON
    setTimeout(() => {
        // 初始化地图（如果不存在）
        if (typeof initMap === 'function') {
            if (!window.map && !window.mapInitializing) {
                initMap();
            }
            
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
    }, 500);
});

