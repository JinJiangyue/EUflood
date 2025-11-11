/**
 * 地图管理模块
 */

// 地图相关全局变量（需要在全局作用域中，以便其他模块访问）
window.map = null;
window.geojsonLayer = null;
window.dataPointsLayer = null;
window.currentGeoJSON = null;
window.mapInitializing = false; // 标记地图是否正在初始化

// 为了兼容性，也创建局部变量引用
let map = window.map;
let geojsonLayer = window.geojsonLayer;
let dataPointsLayer = window.dataPointsLayer;
let currentGeoJSON = window.currentGeoJSON;
let mapInitializing = window.mapInitializing;

/**
 * 初始化地图
 */
function initMap(center = [55, 10], zoom = 4) {
    // 如果正在初始化，等待完成
    if (window.mapInitializing) {
        console.log('地图正在初始化中，跳过重复调用');
        return;
    }
    
    // 如果地图已存在且有效，只更新视图
    if (window.map && window.map._leaflet_id) {
        try {
            window.map.setView(center, zoom);
            setTimeout(() => {
                if (window.map) {
                    window.map.invalidateSize();
                }
            }, 100);
            return;
        } catch (e) {
            console.warn('更新地图视图时出错，将重新初始化:', e);
        }
    }
    
    // 设置初始化标志
    mapInitializing = true;
    window.mapInitializing = true;
    const mapContainer = document.getElementById('mapContainer');
    const mapDiv = document.getElementById('map');
    
    if (!mapContainer || !mapDiv) {
        console.warn('地图容器不存在');
        mapInitializing = false;
        window.mapInitializing = false;
        return;
    }
    
    // 确保容器可见
    mapContainer.style.display = 'block';
    mapDiv.style.display = 'block';
    
    // 彻底清理现有地图和图层
    if (window.map) {
        map = window.map; // 同步局部变量
        try {
            // 先移除所有图层（在移除地图之前）
            if (window.geojsonLayer) {
                geojsonLayer = window.geojsonLayer;
                try {
                    if (map.hasLayer && map.hasLayer(geojsonLayer)) {
                        map.removeLayer(geojsonLayer);
                    }
                } catch (e) {
                    // 忽略图层移除错误
                }
                geojsonLayer = null;
                window.geojsonLayer = null;
            }
            if (window.dataPointsLayer) {
                dataPointsLayer = window.dataPointsLayer;
                try {
                    if (map.hasLayer && map.hasLayer(dataPointsLayer)) {
                        map.removeLayer(dataPointsLayer);
                    }
                } catch (e) {
                    // 忽略图层移除错误
                }
                dataPointsLayer = null;
                window.dataPointsLayer = null;
            }
            
            // 移除所有事件监听器
            try {
                map.off();
            } catch (e) {
                // 忽略事件移除错误
            }
            
            // 检查容器是否仍然属于这个地图实例
            if (map._container && map._container._leaflet_id === map._leaflet_id) {
                // 安全移除地图
                try {
                    map.remove();
                } catch (e) {
                    // 如果移除失败，手动清理容器引用
                    console.warn('无法移除地图，手动清理:', e);
                    if (map._container) {
                        delete map._container._leaflet_id;
                    }
                }
            } else {
                // 容器已经被其他实例使用，只清理引用
                console.warn('地图容器已被其他实例使用，只清理引用');
            }
            
            map = null;
            window.map = null;
        } catch (e) {
            console.warn('清理地图时出错:', e);
            // 即使出错也要清理引用
            map = null;
            window.map = null;
        }
    }
    
    // 彻底清理容器（包括 Leaflet 内部引用）
    if (mapDiv) {
        try {
            // 如果有 Leaflet ID，说明容器被占用
            if (mapDiv._leaflet_id) {
                // 先清空内容，这会强制 Leaflet 清理内部引用
                mapDiv.innerHTML = '';
            }
        } catch (e) {
            console.warn('清理地图容器时出错:', e);
            // 如果清理失败，强制清空容器
            mapDiv.innerHTML = '';
        }
    }
    
    // 等待容器完全清理后再初始化地图
    setTimeout(() => {
        try {
            // 再次检查容器是否干净，如果仍有残留，强制清理并重试
            if (mapDiv._leaflet_id) {
                console.warn('地图容器仍有残留，强制清理');
                // 清空容器
                mapDiv.innerHTML = '';
                // 删除所有 Leaflet 相关属性
                Object.keys(mapDiv).forEach(key => {
                    if (key.startsWith('_leaflet')) {
                        try {
                            delete mapDiv[key];
                        } catch (e) {
                            // 忽略删除错误
                        }
                    }
                });
                // 等待更长时间确保 Leaflet 完成清理
                setTimeout(() => {
                    // 再次检查
                    if (mapDiv._leaflet_id) {
                        console.warn('容器仍有残留，使用替换容器方式');
                        // 如果仍有残留，创建新容器替换
                        const newMapDiv = document.createElement('div');
                        newMapDiv.id = 'map';
                        newMapDiv.style.width = '100%';
                        newMapDiv.style.height = '600px';
                        mapDiv.parentNode.replaceChild(newMapDiv, mapDiv);
                        // 清除初始化标志，让外层可以重试
                        mapInitializing = false;
                        window.mapInitializing = false;
                        // 使用新的容器引用重新初始化（延迟一下避免立即递归）
                        setTimeout(() => {
                            if (!window.mapInitializing) {
                                initMap(center, zoom);
                            }
                        }, 100);
                        return;
                    } else {
                        // 清理完成，清除标志并继续初始化
                        mapInitializing = false;
                        window.mapInitializing = false;
                        // 使用 setTimeout 避免立即递归
                        setTimeout(() => {
                            if (!window.mapInitializing && (!window.map || !window.map._leaflet_id)) {
                                initMap(center, zoom);
                            }
                        }, 50);
                    }
                }, 200);
                return;
            }
            
            // 容器已干净，初始化新地图
            map = L.map('map', {
                preferCanvas: false
            }).setView(center, zoom);
            window.map = map; // 更新全局变量
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);
            
            // 等待地图渲染完成后再调整大小
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                    // 地图初始化完成，清除标志
                    mapInitializing = false;
                    window.mapInitializing = false;
                }
            }, 200);
        } catch (error) {
            console.error('地图初始化失败:', error);
            // 如果初始化失败，强制清理后重试一次
            if (mapDiv) {
                mapDiv.innerHTML = '';
                if (mapDiv._leaflet_id) {
                    delete mapDiv._leaflet_id;
                }
                        map = null;
                        window.map = null;
                        setTimeout(() => {
                            try {
                                map = L.map('map').setView(center, zoom);
                                window.map = map;
                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    attribution: '© OpenStreetMap contributors',
                                    maxZoom: 19
                                }).addTo(map);
                                setTimeout(() => {
                                    if (map) {
                                        map.invalidateSize();
                                        mapInitializing = false;
                                        window.mapInitializing = false;
                                    }
                                }, 200);
                            } catch (retryError) {
                                console.error('地图重试初始化失败:', retryError);
                                alert('地图初始化失败: ' + retryError.message);
                                mapInitializing = false;
                                window.mapInitializing = false;
                            }
                        }, 200);
            } else {
                alert('地图初始化失败: ' + error.message);
                mapInitializing = false;
            }
        } finally {
            // 确保在出错时也清除初始化标志
            if (!window.map || !window.map._leaflet_id) {
                mapInitializing = false;
                window.mapInitializing = false;
            }
        }
    }, 150);
}

/**
 * 格式化NUTS信息
 */
function formatNUTSInfo(properties) {
    if (!properties) return '';
    const i18n = typeof t === 'function' ? t : (key) => key;
    let info = `<div style="font-weight: bold; margin-bottom: 5px; color: #1e3c72;">${i18n('map.nuts.title')}</div>`;
    if (properties.NUTS_ID) info += `<div><strong>NUTS ID:</strong> ${properties.NUTS_ID}</div>`;
    if (properties.NUTS_NAME) info += `<div><strong>${i18n('map.nuts.name')}:</strong> ${properties.NUTS_NAME}</div>`;
    if (properties.NAME_LATN) info += `<div><strong>${i18n('map.nuts.latinName')}:</strong> ${properties.NAME_LATN}</div>`;
    if (properties.CNTR_CODE) info += `<div><strong>${i18n('map.nuts.countryCode')}:</strong> ${properties.CNTR_CODE}</div>`;
    if (properties.LEVL_CODE !== undefined) info += `<div><strong>${i18n('map.nuts.level')}:</strong> NUTS ${properties.LEVL_CODE}</div>`;
    if (properties.NAME) info += `<div><strong>${i18n('map.nuts.fullName')}:</strong> ${properties.NAME}</div>`;
    if (properties['cntr-nuts3']) info += `<div><strong>${i18n('map.nuts.countryNuts3')}:</strong> ${properties['cntr-nuts3']}</div>`;
    return info;
}

/**
 * 添加GeoJSON图层到地图
 */
function addGeoJSONLayer(geojsonData) {
    if (!window.map) return;
    
    map = window.map; // 同步局部变量
    
    // 移除旧的GeoJSON图层
    if (window.geojsonLayer) {
        geojsonLayer = window.geojsonLayer;
        map.removeLayer(geojsonLayer);
    }
    
    // 添加新的GeoJSON图层，并绑定交互事件
    geojsonLayer = L.geoJSON(geojsonData, {
        style: {
            color: '#3498db',
            weight: 2,
            fillColor: '#3498db',
            fillOpacity: 0.1
        },
        onEachFeature: function(feature, layer) {
            // 鼠标悬停时改变样式
            layer.on({
                mouseover: function(e) {
                    const layer = e.target;
                    layer.setStyle({
                        weight: 4,
                        fillOpacity: 0.3,
                        color: '#2c3e50',
                        fillColor: '#3498db'
                    });
                    
                    // 显示工具提示
                    if (feature.properties) {
                        const info = formatNUTSInfo(feature.properties);
                        layer.bindTooltip(info, {
                            permanent: false,
                            direction: 'top',
                            offset: [0, -10],
                            className: 'nuts-tooltip',
                            opacity: 0.95
                        }).openTooltip();
                    }
                },
                mouseout: function(e) {
                    const layer = e.target;
                    layer.setStyle({
                        weight: 2,
                        fillOpacity: 0.1,
                        color: '#3498db',
                        fillColor: '#3498db'
                    });
                    layer.closeTooltip();
                },
                click: function(e) {
                    // 点击时也可以显示详细信息
                    const layer = e.target;
                    if (feature.properties) {
                        const info = formatNUTSInfo(feature.properties);
                        layer.bindPopup(info, {
                            maxWidth: 300,
                            className: 'nuts-popup'
                        }).openPopup();
                    }
                }
            });
        }
    }).addTo(map);
    window.geojsonLayer = geojsonLayer; // 更新全局变量
}

/**
 * 加载默认GeoJSON区域
 */
async function loadDefaultGeoJSON() {
    const status = document.getElementById('interpolationStatus');
    if (status) {
        status.style.display = 'block';
        status.innerHTML = '<div style="color: #3498db;">🗺️ 正在加载GeoJSON区域...</div>';
    }
    
    try {
        const res = await fetch('/python/geojson/domain_xinyu_20250729_093415.geojson');
        if (!res.ok) {
            console.warn('无法加载默认GeoJSON文件');
            if (status) {
                status.innerHTML = '<div style="color: #f39c12;">⚠️ 无法加载GeoJSON文件（文件可能不存在）</div>';
            }
            return;
        }
        
        const data = await res.json();
        if (data.success && data.data) {
            currentGeoJSON = data.data;
            window.currentGeoJSON = data.data;
            
            // 确保地图已初始化（等待而不是重新初始化）
            const waitForMap = (maxAttempts = 10, attempt = 0) => {
                if (window.map && window.map._leaflet_id) {
                    return;
                }
                
                if (attempt < maxAttempts) {
                    // 如果地图正在初始化，等待一下再检查
                    setTimeout(() => waitForMap(maxAttempts, attempt + 1), 200);
                } else {
                    console.warn('等待地图初始化超时，无法加载GeoJSON');
                }
            };
            
            // 如果地图不存在且不在初始化中，才初始化
            if (!window.map && !window.mapInitializing) {
                initMap();
            }
            
            // 等待地图初始化完成
            waitForMap();
            
            // 等待地图初始化完成后再添加图层
            setTimeout(() => {
                if (!window.map) {
                    // 如果地图还没初始化，再等一会儿
                    setTimeout(() => {
                        if (!window.map) return;
                        addGeoJSONLayer(data.data);
                    }, 500);
                    return;
                }
                
                addGeoJSONLayer(data.data);
                
                if (status) {
                    const i18n = typeof t === 'function' ? t : (key) => key;
                    status.innerHTML = `<div style="color: #27ae60;">✅ ${i18n('map.geojsonLoaded')}</div>`;
                    // 3秒后隐藏状态
                    setTimeout(() => {
                        status.style.display = 'none';
                    }, 3000);
                }
            }, 800);
        }
    } catch (error) {
        console.error('加载GeoJSON失败:', error);
        if (status) {
            status.innerHTML = `<div style="color: #e74c3c;">❌ 加载GeoJSON失败: ${error.message}</div>`;
        }
    }
}

/**
 * 添加数据点标记到地图
 */
function addMarkersToMap(points, threshold = 50.0) {
    if (!window.map) {
        setTimeout(() => addMarkersToMap(points, threshold), 100);
        return;
    }
    
    map = window.map; // 同步局部变量
    
    // 移除旧的数据点图层
    if (window.dataPointsLayer) {
        dataPointsLayer = window.dataPointsLayer;
        map.removeLayer(dataPointsLayer);
    }
    
    // 显示数据点
    if (points && points.length > 0) {
        const markers = [];
        
        points.forEach((point, index) => {
            if (point.latitude && point.longitude) {
                // 根据值设置颜色（使用统一的颜色判断函数）
                const color = getMarkerColorByValue(point.value, { 
                    medium: threshold, 
                    high: threshold * 1.5 
                });
                
                const marker = L.circleMarker([point.latitude, point.longitude], {
                    radius: 8,
                    fillColor: color,
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 0.8
                }).addTo(map);
                
                // 添加弹出信息
                let popupContent = `<strong>数据点 #${index + 1}</strong><br>`;
                popupContent += `经度：${point.longitude.toFixed(4)}<br>`;
                popupContent += `纬度：${point.latitude.toFixed(4)}<br>`;
                if (point.value !== null && point.value !== undefined) {
                    popupContent += `值：${point.value}<br>`;
                }
                
                marker.bindPopup(popupContent);
                markers.push(marker);
            }
        });
        
        // 创建图层组
        dataPointsLayer = L.layerGroup(markers);
        window.dataPointsLayer = dataPointsLayer; // 更新全局变量
        
        return markers.length;
    }
    
    return 0;
}

