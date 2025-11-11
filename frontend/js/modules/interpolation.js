/**
 * 降雨导入模块
 */

let uploadedFileInfo = null;

/**
 * 更新文件选择按钮显示状态
 */
function updateFileButtonDisplay(fileInput, fileButtonText, fileStatusText) {
    const i18n = getI18n();
    const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
    
    if (fileButtonText) {
        if (hasFile) {
            fileButtonText.textContent = fileInput.files[0].name;
            fileButtonText.style.fontWeight = '600';
            fileButtonText.style.color = '#1e3c72';
        } else {
            fileButtonText.textContent = i18n('file.select.chooseFile');
            fileButtonText.style.fontWeight = 'normal';
            fileButtonText.style.color = '#2c3e50';
        }
    }
    
    if (fileStatusText) {
        if (hasFile) {
            fileStatusText.textContent = i18n('file.select.replaceHint');
            fileStatusText.style.color = '#27ae60';
            fileStatusText.style.fontWeight = '600';
        } else {
            fileStatusText.textContent = i18n('file.select.noFileChosen');
            fileStatusText.style.color = '#666';
            fileStatusText.style.fontWeight = 'normal';
        }
    }
}

/**
 * 获取阈值参数（从输入框读取，默认50.0）
 */
function getThresholdValue() {
    const thInput = document.getElementById('valueThreshold');
    if (thInput && thInput.value !== undefined && thInput.value !== null && thInput.value !== '') {
        const v = parseFloat(thInput.value);
        if (!Number.isNaN(v) && Number.isFinite(v) && v >= 0) {
            return v;
        }
    }
    return 50.0;
}

/**
 * 显示地点列表（国家/省/市）
 */
function renderPlacesList(points, containerId = 'interpolationPlaces') {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const uniqueSet = new Map();
        for (const p of points) {
            const country = p.country_name || p.country_code || '';
            const province = p.province_name || '';
            const city = p.city_name || '';
            const key = `${country}||${province}||${city}`;
            if (!uniqueSet.has(key)) {
                uniqueSet.set(key, { country, province, city, count: 1 });
            } else {
                uniqueSet.get(key).count += 1;
            }
        }
        
        if (uniqueSet.size > 0) {
            const rows = Array.from(uniqueSet.values()).map(item => {
                const country = item.country || '—';
                const prov = item.province || '—';
                const city = item.city || '—';
                return `<li style="padding:6px 8px; border-bottom:1px dashed #eef3f7;">
                    <span style="color:#1e3c72; font-weight:600;">${escapeHtml(country)}</span>
                    <span style="color:#2c3e50; margin-left:8px;">${escapeHtml(prov)}</span>
                    <span style="color:#2c3e50; margin-left:8px;">${escapeHtml(city)}</span>
                    <span style="color:#999; float:right;">${item.count} ${getI18n()('interpolation.place.points')}</span>
                </li>`;
            }).join('');
            const i18n = getI18n();
            container.innerHTML = `<div style="font-weight:600; color:#1e3c72; margin-bottom:8px;">${i18n('interpolation.place.placeList')}</div>
                <ul style="list-style:none; padding-left:0; margin:0;">${rows}</ul>`;
            container.style.display = 'block';
        } else {
            const i18n = getI18n();
            container.innerHTML = `<div style="color:#999;">${i18n('interpolation.place.noLocationInfo')}</div>`;
            container.style.display = 'block';
        }
    } catch (e) {
        console.error('[Frontend] 渲染地点列表失败:', e);
    }
}

/**
 * 确保地图图例存在（使用与首页相同的固定阈值）
 */
function ensureMapLegend() {
    if (!window.map || typeof L === 'undefined') return;
    
    // 移除旧图例
    if (window.mapLegendControl) {
        window.mapLegendControl.remove();
        window.mapLegendControl = null;
    }
    
    // 使用与首页相同的固定阈值
    const MAP_THRESHOLDS = {
        medium: 50,
        high: 100
    };
    
    const i18n = getI18n();
    const legendTitle = i18n('map.legend.title') || '图例';
    const highLabel = i18n('map.legend.high', { value: MAP_THRESHOLDS.high }) || `> ${MAP_THRESHOLDS.high} mm（高强度）`;
    const mediumLabel = i18n('map.legend.medium', { min: MAP_THRESHOLDS.medium, max: MAP_THRESHOLDS.high }) || `${MAP_THRESHOLDS.medium}-${MAP_THRESHOLDS.high} mm（中等强度）`;
    const lowLabel = i18n('map.legend.low', { value: MAP_THRESHOLDS.medium }) || `≤ ${MAP_THRESHOLDS.medium} mm（低强度）`;
    
    const legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'dashboard-map-legend');
        div.innerHTML = `
            <div class="legend-title">${legendTitle}</div>
            <div class="legend-item">
                <span class="legend-color high"></span>
                <div>${highLabel}</div>
            </div>
            <div class="legend-item">
                <span class="legend-color medium"></span>
                <div>${mediumLabel}</div>
            </div>
            <div class="legend-item">
                <span class="legend-color low"></span>
                <div>${lowLabel}</div>
            </div>
        `;
        return div;
    };
    legendControl.addTo(window.map);
    window.mapLegendControl = legendControl;
}

/**
 * 初始化地图并添加标记
 */
function initMapAndAddMarkers(points, threshold, statusElement) {
    // 初始化地图（如果还未初始化）
    if (typeof initMap === 'function' && !window.map) {
        // 使用与仪表盘相同的初始视图设置
        initMap([55, 10], 4);
    }
    
    // 等待地图完全初始化后再添加标记
    if (typeof addMarkersToMap === 'function') {
        const addMarkers = () => {
            const markerCount = addMarkersToMap(points, threshold);
            // 添加图例（使用与首页相同的固定阈值）
            ensureMapLegend();
            if (statusElement && markerCount > 0) {
                const i18n = getI18n();
                statusElement.innerHTML += `<div style="margin-top: 10px; color: #27ae60;">✅ ${i18n('interpolation.place.pointsDisplayed', { count: markerCount })}</div>`;
            } else if (statusElement) {
                statusElement.innerHTML += `<div style="margin-top: 10px; color: #f39c12;">⚠️ 没有找到符合条件的数据点</div>`;
            }
        };
        
        if (!window.map) {
            setTimeout(addMarkers, 500);
        } else {
            addMarkers();
        }
    }
}

/**
 * 初始化降雨导入模块
 */
function initInterpolation() {
    // 设置确认日期输入框的默认值为今天
    const confirmedDateInput = document.getElementById('confirmedDateInput');
    if (confirmedDateInput && !confirmedDateInput.value) {
        confirmedDateInput.value = new Date().toISOString().slice(0, 10);
    }
    
    // 设置查询日期输入框的默认值为今天
    const queryDateInput = document.getElementById('queryDateInput');
    if (queryDateInput && !queryDateInput.value) {
        queryDateInput.value = new Date().toISOString().slice(0, 10);
    }

    // 同步阈值输入的可编辑状态（grid 时禁用）
    try {
        const modeEl = document.getElementById('thresholdMode');
        const thEl = document.getElementById('valueThreshold');
        if (modeEl && thEl) {
            const syncDisabled = () => {
                const m = (modeEl.value || 'grid');
                thEl.disabled = (m === 'grid');
                thEl.style.opacity = thEl.disabled ? '0.6' : '1';
            };
            syncDisabled();
            modeEl.addEventListener('change', syncDisabled);
        }
    } catch {}

    // 文件选择
    const fileInput = document.getElementById('interpolationFileInput');
    const fileButtonText = document.getElementById('fileButtonText');
    const fileStatusText = document.getElementById('fileStatusText');
    
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            const i18n = getI18n();
            
            if (file) {
                // 更新文件按钮显示
                updateFileButtonDisplay(fileInput, fileButtonText, fileStatusText);
                
                // 更新文件信息显示
                const fileInfo = document.getElementById('interpolationFileInfo');
                if (fileInfo) {
                    fileInfo.innerHTML = `<strong>${i18n('file.info.fileName')}：</strong>${file.name}<br><strong>${i18n('file.info.fileSize')}：</strong>${(file.size / 1024).toFixed(2)} KB`;
                    fileInfo.style.display = 'block';
                }
                
                // 从文件名解析日期，填充到 confirmedDateInput
                const dateInput = document.getElementById('confirmedDateInput');
                if (dateInput) {
                    const m = file.name.match(/(20\d{6})/); // 如 20251106
                    if (m) {
                        const y = m[1].slice(0,4), mo = m[1].slice(4,6), d = m[1].slice(6,8);
                        dateInput.value = `${y}-${mo}-${d}`;
                    } else {
                        dateInput.value = new Date().toISOString().slice(0,10);
                    }
                }
            } else {
                // 重置显示
                updateFileButtonDisplay(fileInput, fileButtonText, fileStatusText);
            }
        });
        
        // 监听语言切换事件，更新文件选择按钮文本
        window.addEventListener('languageChanged', function() {
            updateFileButtonDisplay(fileInput, fileButtonText, fileStatusText);
        });
    }
    
    // 上传文件
    const btnUpload = document.getElementById('btnUploadInterpolationFile');
    if (btnUpload) {
        btnUpload.addEventListener('click', async function() {
            const fileInput = document.getElementById('interpolationFileInput');
            const file = fileInput?.files[0];
            const i18n = getI18n();
            
            if (!file) {
                alert(i18n('file.select.pleaseSelectFileFirst'));
                return;
            }
            
            const btn = this;
            const status = document.getElementById('interpolationStatus');
            btn.disabled = true;
            btn.textContent = i18n('file.upload.uploading');
            if (status) {
                status.style.display = 'block';
                status.innerHTML = `<div style="color: #3498db;">${i18n('file.upload.uploadingFile')}</div>`;
            }
            
            try {
                const formData = new FormData();
                formData.append('file', file);
                
                const res = await fetch('/python/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await res.json();
                if (!res.ok) {
                    const errorMsg = data.error || data.details || i18n('file.upload.failed');
                    throw new Error(`${i18n('file.upload.failed')} (${res.status}): ${errorMsg}`);
                }
                
                if (data.success) {
                    uploadedFileInfo = data.file;
                    
                    // 更新文件信息
                    const fileInfo = document.getElementById('interpolationFileInfo');
                    if (fileInfo) {
                        fileInfo.innerHTML = 
                            `<strong>${i18n('file.info.fileName')}：</strong>${data.file.filename}<br><strong>${i18n('file.info.fileSize')}：</strong>${(data.file.size / 1024).toFixed(2)} KB`;
                        fileInfo.style.display = 'block';
                    }
                    
                    // 显示成功消息（使用更明显的样式，并确保显示）
                    if (status) {
                        status.style.display = 'block';
                        status.innerHTML = `<div style="color: #27ae60; padding: 12px 15px; background: #e8f8f0; border-left: 4px solid #27ae60; border-radius: 4px; font-weight: 600; margin-top: 10px;">
                            ✅ ${i18n('file.upload.success', { filename: data.file.filename })}
                        </div>`;
                        
                        // 确保状态区域可见（延迟一点，确保DOM更新）
                        setTimeout(() => {
                            if (status) {
                                status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }
                        }, 100);
                    }
                    
                    // 上传成功后，启用"筛选入库"按钮
                    const btnSave = document.getElementById('btnSaveRainEvents');
                    if (btnSave) {
                        btnSave.disabled = false;
                    }
                } else {
                    throw new Error(data.error || i18n('file.upload.failed'));
                }
            } catch (error) {
                if (status) {
                    status.innerHTML = `<div style="color: #e74c3c;">❌ ${i18n('file.upload.failed')}：${error.message}</div>`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = i18n('file.upload.file');
            }
        });
    }

    // 筛选入库（对已上传的文件进行插值筛选并入库）
    const btnSave = document.getElementById('btnSaveRainEvents');
    if (btnSave) {
        btnSave.addEventListener('click', async function() {
            const i18n = getI18n();
            if (!uploadedFileInfo || !uploadedFileInfo.filename) {
                alert(i18n('file.select.pleaseUploadFileFirst'));
                return;
            }
            
            const dateInput = document.getElementById('confirmedDateInput');
            const confirmedDate = dateInput?.value;
            const status = document.getElementById('interpolationStatus');
            if (!confirmedDate) {
                alert(i18n('interpolation.form.pleaseSelectDateFirst'));
                return;
            }

            const btn = this;
            btn.disabled = true;
            btn.textContent = i18n('interpolation.action.filteringAndSaving');
            if (status) {
                status.style.display = 'block';
                status.innerHTML = `<div style="color:#3498db;">${i18n('interpolation.action.filteringAndSavingInProgress')}</div>`;
            }

            try {
                // 获取阈值参数
                const threshold = getThresholdValue();

                // 使用已上传的文件信息，调用筛选入库接口
                const formData = new FormData();
                // 需要重新读取文件（因为后端需要文件内容）
                const fileInput = document.getElementById('interpolationFileInput');
                const file = fileInput?.files[0];
                if (!file) {
                    throw new Error(i18n('file.select.fileLost'));
                }
                formData.append('file', file);
                formData.append('confirmed_date', confirmedDate);
                formData.append('value_threshold', String(threshold));
                
                // 读取阈值模式并提交
                const modeSel = document.getElementById('thresholdMode');
                const mode = modeSel && modeSel.value ? modeSel.value : 'grid';
                formData.append('threshold_mode', mode);
                if (mode === 'grid') {
                    // 提供合理默认：5年一遇 + 最近邻
                    formData.append('grid_rp_for_filter', '005y');
                    formData.append('grid_interp_method', 'nearest');
                    // 其余（nc文件路径）由后端按默认目录自动填充
                }

                const res = await fetch('/python/rain/process-upload', { method: 'POST', body: formData });
                if (!res.ok) {
                    let msg = i18n('interpolation.action.saveFailedWithStatus', { status: res.status });
                    try { const e = await res.json(); msg = e.error || msg; } catch {}
                    throw new Error(msg);
                }
                const data = await res.json();
                if (!data.success) throw new Error(data.error || i18n('interpolation.action.saveFailed'));

                // 显示入库成功信息
                if (status) {
                    status.innerHTML = `<div style="color:#27ae60;">✅ ${i18n('interpolation.action.filterAndSaveCompleted', { count: data.inserted })}</div>`;
                }

                // 如果有插值结果数据，显示地点列表和地图标记
                const resultData = data.data || data;
                if (resultData && resultData.points && Array.isArray(resultData.points)) {
                    const points = resultData.points;
                    renderPlacesList(points);
                    initMapAndAddMarkers(points, threshold, status);
                }
            } catch (err) {
                if (status) {
                    status.innerHTML = `<div style="color:#e74c3c;">❌ ${i18n('interpolation.action.filterAndSaveFailed', { error: (err && err.message) || err })}</div>`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = i18n('interpolation.action.filterAndSave');
            }
        });
    }
    
    // 运行降雨数据处理
    const btnRun = document.getElementById('btnRunInterpolation');
    if (btnRun) {
        btnRun.addEventListener('click', async function() {
            const i18n = getI18n();
            if (!uploadedFileInfo) {
                alert(i18n('file.select.pleaseUploadFileFirst'));
                return;
            }
            
            const btn = this;
            const status = document.getElementById('interpolationStatus');
            const threshold = getThresholdValue();
            
            btn.disabled = true;
            btn.textContent = '🗺️ 处理中...';
            if (status) {
                status.style.display = 'block';
                status.innerHTML = '<div style="color: #3498db;">正在处理数据，请稍候（可能需要几分钟）...</div>';
            }
            
            try {
                // 检查 uploadedFileInfo 是否存在
                if (!uploadedFileInfo || !uploadedFileInfo.filename) {
                    throw new Error('文件信息不存在，请重新上传文件');
                }
                
                // 创建带有超时的 fetch 请求（5分钟超时）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5分钟
                
                let res;
                try {
                    res = await fetch('/python/interpolation', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: uploadedFileInfo.filename,
                            value_threshold: threshold,
                            max_points: 1000,
                            // 阈值模式与网格参数
                            threshold_mode: (document.getElementById('thresholdMode')?.value || 'grid'),
                            grid_rp_for_filter: '005y',
                            grid_interp_method: 'nearest',
                            // 显式指定 LAU 数据源，避免自动探测失败
                            lau_file: 'E:/Project/europe/apps/api/src/modules/python/scripts/data/LAU_2019.gpkg',
                            timeout: 4 * 60 * 1000 // 4分钟超时（给前端留1分钟缓冲）
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        throw new Error('请求超时（超过5分钟），请检查数据文件大小或稍后重试');
                    } else if (fetchError.message.includes('Failed to fetch')) {
                        throw new Error('无法连接到服务器，请确保服务器正在运行（localhost:3000）');
                    } else {
                        throw new Error(`网络错误: ${fetchError.message}`);
                    }
                }
                
                if (!res.ok) {
                    let errorMsg = `处理失败 (HTTP ${res.status})`;
                    try {
                        const errorData = await res.json();
                        errorMsg = errorData.error || errorMsg;
                    } catch (e) {
                        // 如果响应不是JSON，使用状态文本
                        errorMsg = res.statusText || errorMsg;
                    }
                    throw new Error(errorMsg);
                }
                
                const data = await res.json();
                
                if (!data.success) {
                    const errorMsg = data.error || '处理失败';
                    throw new Error(errorMsg);
                }
                
                if (data.success && data.data) {
                    if (status) {
                        status.innerHTML = `<div style="color: #27ae60;">✅ 处理完成！耗时：${(data.executionTime / 1000).toFixed(2)}秒</div>`;
                    }
                    
                    const result = data.data;
                    
                    // 显示处理摘要
                    if (result.summary && status) {
                        status.innerHTML += `<div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 5px; font-size: 14px;">
                            <strong>处理摘要：</strong><br>
                            总点数：${result.summary.total_points || 0}<br>
                            ${result.summary.value_threshold !== undefined ? `阈值：${result.summary.value_threshold}<br>` : ''}
                            ${result.summary.max_points ? `最大点数限制：${result.summary.max_points}` : ''}
                        </div>`;
                    }
                    
                    // 显示地点列表和地图标记
                    const points = result.points || result.final_points || [];
                    renderPlacesList(points);
                    initMapAndAddMarkers(points, threshold, status);
                    
                    // 保存处理结果
                    window.interpolationResult = result;
                } else {
                    throw new Error(data.error || '处理失败');
                }
            } catch (error) {
                let errorMsg = error.message || '未知错误';
                
                // 提供更详细的错误信息和解决建议
                let suggestion = '';
                if (errorMsg.includes('Failed to fetch') || errorMsg.includes('无法连接')) {
                    suggestion = '<br><strong style="color: #2c3e50;">💡 解决建议：</strong><br>' +
                        '1. <strong>确保后端服务器正在运行</strong><br>' +
                        '&nbsp;&nbsp;&nbsp;在终端运行: <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px;">cd apps/api && npm run dev</code><br>' +
                        '2. 检查服务器地址是否为 <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px;">http://localhost:3000</code><br>' +
                        '3. 查看浏览器控制台（F12 → Console）获取详细错误';
                } else if (errorMsg.includes('超时')) {
                    suggestion = '<br><strong style="color: #2c3e50;">💡 解决建议：</strong><br>' +
                        '1. 数据文件可能太大，处理时间较长（19700个点需要几分钟）<br>' +
                        '2. 检查后端日志查看处理进度<br>' +
                        '3. 如果一直超时，尝试减少数据点数量';
                } else if (errorMsg.includes('文件')) {
                    suggestion = '<br><strong style="color: #2c3e50;">💡 解决建议：</strong><br>' +
                        '1. 请重新上传数据文件<br>' +
                        '2. 确保文件格式正确（制表符分隔：X、Y、Value）';
                }
                
                if (status) {
                    status.innerHTML = `<div style="color: #e74c3c; padding: 15px; background: #fff5f5; border-left: 4px solid #e74c3c; border-radius: 4px;">
                        ❌ <strong>处理失败：</strong>${errorMsg}<br>
                        <small style="color: #999; font-size: 12px; margin-top: 10px; display: block;">请查看浏览器控制台（F12 → Console）和后端日志获取详细信息</small>
                        ${suggestion}
                    </div>`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = '📥 处理降雨数据';
            }
        });
    }
    
    // 按地址查询降雨数据
    const btnQueryByLocation = document.getElementById('btnQueryByLocation');
    if (btnQueryByLocation) {
        btnQueryByLocation.addEventListener('click', async function() {
            const addressInput = document.getElementById('queryAddressInput');
            const dateInput = document.getElementById('queryDateInput');
            const status = document.getElementById('queryByLocationStatus');
            const i18n = getI18n();
            
            const address = addressInput?.value?.trim();
            const date = dateInput?.value;
            
            if (!address) {
                if (status) {
                    status.style.display = 'block';
                    status.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #fff5f5; border-left: 4px solid #e74c3c; border-radius: 4px;">
                        ❌ ${i18n('interpolation.query.addressRequired')}
                    </div>`;
                }
                return;
            }
            
            if (!date) {
                if (status) {
                    status.style.display = 'block';
                    status.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #fff5f5; border-left: 4px solid #e74c3c; border-radius: 4px;">
                        ❌ ${i18n('interpolation.query.dateRequired')}
                    </div>`;
                }
                return;
            }
            
            const btn = this;
            btn.disabled = true;
            btn.textContent = i18n('interpolation.query.searching');
            
            if (status) {
                status.style.display = 'block';
                status.innerHTML = `<div style="color: #3498db; padding: 10px; background: #e8f4f8; border-left: 4px solid #3498db; border-radius: 4px;">
                    🔍 ${i18n('interpolation.query.searching')}...
                </div>`;
            }
            
            try {
                // 获取阈值设置（如果输入框为空则不传，让后端使用默认值50）
                const thInput = document.getElementById('valueThreshold');
                let threshold = undefined;
                if (thInput && thInput.value !== undefined && thInput.value !== null && thInput.value !== '') {
                    const v = parseFloat(thInput.value);
                    if (!Number.isNaN(v) && Number.isFinite(v) && v >= 0) {
                        threshold = v;
                    }
                }
                
                const modeSel = document.getElementById('thresholdMode');
                const thresholdMode = modeSel && modeSel.value ? modeSel.value : 'grid';
                
                const requestBody = {
                    address: address,
                    date: date,
                    threshold_mode: thresholdMode
                };
                // 只有当阈值有值时才添加到请求中
                if (threshold !== undefined) {
                    requestBody.value_threshold = threshold;
                }
                
                const response = await fetch('/python/rain/query-by-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });
                
                const data = await response.json();
                
                if (!response.ok || !data.success) {
                    // 翻译错误消息
                    let errorMsg = data.error || i18n('interpolation.query.searchFailed');
                    // 常见错误消息的翻译
                    if (errorMsg.includes('No file found for date')) {
                        const dateMatch = errorMsg.match(/date\s+([\d-]+)/);
                        const date = dateMatch ? dateMatch[1] : '';
                        errorMsg = i18n('interpolation.query.fileNotFound', { date: date }) || `未找到日期 ${date} 对应的文件，请先上传文件`;
                    } else if (errorMsg.includes('Address not found')) {
                        errorMsg = i18n('interpolation.query.addressNotFound') || '地址未找到，请提供更具体的地址';
                    } else if (errorMsg.includes('Geocoding failed')) {
                        errorMsg = i18n('interpolation.query.geocodingFailed') || '地理编码失败';
                    } else if (errorMsg.includes('NUTS3')) {
                        errorMsg = i18n('interpolation.query.nuts3NotFound') || '未找到该位置所在的NUTS3区域';
                    }
                    throw new Error(errorMsg);
                }
                
                // 显示成功信息
                if (status) {
                    const pointCount = data.data?.points?.length || 0;
                    status.innerHTML = `<div style="color: #27ae60; padding: 10px; background: #e8f8f0; border-left: 4px solid #27ae60; border-radius: 4px;">
                        ✅ ${i18n('interpolation.query.searchSuccess', { count: pointCount })}<br>
                        <small style="color: #666; font-size: 12px; margin-top: 5px; display: block;">
                            ${i18n('interpolation.query.location')}: ${data.location?.address || address}<br>
                            ${i18n('interpolation.query.filename')}: ${data.filename || ''}
                        </small>
                    </div>`;
                }
                
                // 在地图上显示结果
                if (data.data && data.data.points && data.data.points.length > 0) {
                    const points = data.data.points;
                    // 使用实际使用的阈值（如果未传则使用默认值50）
                    const displayThreshold = threshold !== undefined ? threshold : 50;
                    
                    // 显示地点列表
                    renderPlacesList(points);
                    
                    // 在地图上显示标记
                    initMapAndAddMarkers(points, displayThreshold, status);
                } else {
                    if (status) {
                        status.innerHTML += `<div style="color: #f39c12; padding: 10px; background: #fff8e1; border-left: 4px solid #f39c12; border-radius: 4px; margin-top: 10px;">
                            ⚠️ ${i18n('interpolation.query.noPointsFound')}
                        </div>`;
                    }
                }
            } catch (error) {
                console.error('Query by location error:', error);
                const errorMsg = error.message || String(error);
                
                if (status) {
                    status.innerHTML = `<div style="color: #e74c3c; padding: 10px; background: #fff5f5; border-left: 4px solid #e74c3c; border-radius: 4px;">
                        ❌ ${i18n('interpolation.query.searchFailed')}: ${errorMsg}
                    </div>`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = i18n('interpolation.query.search');
            }
        });
    }
}

