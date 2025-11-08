/**
 * 空间插值分析模块
 */

let uploadedFileInfo = null;

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
                    <span style="color:#999; float:right;">${item.count} 点</span>
                </li>`;
            }).join('');
            container.innerHTML = `<div style="font-weight:600; color:#1e3c72; margin-bottom:8px;">📍 地点列表（国家/省/市，按唯一组合）</div>
                <ul style="list-style:none; padding-left:0; margin:0;">${rows}</ul>`;
            container.style.display = 'block';
        } else {
            container.innerHTML = '<div style="color:#999;">未识别到国家/省/市信息</div>';
            container.style.display = 'block';
        }
    } catch (e) {
        console.error('[Frontend] 渲染地点列表失败:', e);
    }
}

/**
 * 初始化地图并添加标记
 */
function initMapAndAddMarkers(points, threshold, statusElement) {
    // 初始化地图（如果还未初始化）
    if (typeof initMap === 'function' && !window.map) {
        const validPoints = points.filter(p => p.latitude && p.longitude);
        let center = [50, 10]; // 默认中心（欧洲）
        let zoom = 6;
        
        if (validPoints.length > 0) {
            const avgLat = validPoints.reduce((sum, p) => sum + p.latitude, 0) / validPoints.length;
            const avgLon = validPoints.reduce((sum, p) => sum + p.longitude, 0) / validPoints.length;
            center = [avgLat, avgLon];
            zoom = 8;
        }
        
        initMap(center, zoom);
    }
    
    // 等待地图完全初始化后再添加标记
    if (typeof addMarkersToMap === 'function') {
        if (!window.map) {
            setTimeout(() => {
                const markerCount = addMarkersToMap(points, threshold);
                if (statusElement && markerCount > 0) {
                    statusElement.innerHTML += `<div style="margin-top: 10px; color: #27ae60;">✅ 已在地图上显示 ${markerCount} 个数据点</div>`;
                } else if (statusElement) {
                    statusElement.innerHTML += `<div style="margin-top: 10px; color: #f39c12;">⚠️ 没有找到符合条件的数据点</div>`;
                }
            }, 500);
        } else {
            const markerCount = addMarkersToMap(points, threshold);
            if (statusElement && markerCount > 0) {
                statusElement.innerHTML += `<div style="margin-top: 10px; color: #27ae60;">✅ 已在地图上显示 ${markerCount} 个数据点</div>`;
            } else if (statusElement) {
                statusElement.innerHTML += `<div style="margin-top: 10px; color: #f39c12;">⚠️ 没有找到符合条件的数据点</div>`;
            }
        }
    }
}

/**
 * 初始化空间插值分析模块
 */
function initInterpolation() {
    // 文件选择
    const fileInput = document.getElementById('interpolationFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const fileInfo = document.getElementById('interpolationFileInfo');
                if (fileInfo) {
                    fileInfo.innerHTML = `<strong>文件名：</strong>${file.name}<br><strong>大小：</strong>${(file.size / 1024).toFixed(2)} KB`;
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
            }
        });
    }
    
    // 上传文件
    const btnUpload = document.getElementById('btnUploadInterpolationFile');
    if (btnUpload) {
        btnUpload.addEventListener('click', async function() {
            const fileInput = document.getElementById('interpolationFileInput');
            const file = fileInput?.files[0];
            
            if (!file) {
                alert('请先选择文件');
                return;
            }
            
            const btn = document.getElementById('btnUploadInterpolationFile');
            const status = document.getElementById('interpolationStatus');
            btn.disabled = true;
            btn.textContent = '📤 上传中...';
            if (status) {
                status.style.display = 'block';
                status.innerHTML = '<div style="color: #3498db;">正在上传文件...</div>';
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
                    const errorMsg = data.error || data.details || '上传失败';
                    throw new Error(`上传失败 (${res.status}): ${errorMsg}`);
                }
                
                if (data.success) {
                    uploadedFileInfo = data.file;
                    if (status) {
                        status.innerHTML = `<div style="color: #27ae60;">✅ 上传成功！文件名：${data.file.filename}</div>`;
                    }
                    // 上传成功后，启用"筛选入库"按钮
                    const btnSave = document.getElementById('btnSaveRainEvents');
                    if (btnSave) {
                        btnSave.disabled = false;
                    }
                    
                    // 更新文件信息
                    const fileInfo = document.getElementById('interpolationFileInfo');
                    if (fileInfo) {
                        fileInfo.innerHTML = 
                            `<strong>文件名：</strong>${data.file.filename}<br><strong>大小：</strong>${(data.file.size / 1024).toFixed(2)} KB`;
                    }
                } else {
                    throw new Error(data.error || '上传失败');
                }
            } catch (error) {
                if (status) {
                    status.innerHTML = `<div style="color: #e74c3c;">❌ 上传失败：${error.message}</div>`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = '📤 上传文件';
            }
        });
    }

    // 筛选入库（对已上传的文件进行插值筛选并入库）
    const btnSave = document.getElementById('btnSaveRainEvents');
    if (btnSave) {
        btnSave.addEventListener('click', async function() {
            if (!uploadedFileInfo || !uploadedFileInfo.filename) {
                alert('请先上传文件');
                return;
            }
            
            const dateInput = document.getElementById('confirmedDateInput');
            const confirmedDate = dateInput?.value;
            const status = document.getElementById('interpolationStatus');
            if (!confirmedDate) {
                alert('请先选择/确认日期');
                return;
            }

            const btn = this;
            btn.disabled = true;
            btn.textContent = '💾 筛选入库中...';
            if (status) {
                status.style.display = 'block';
                status.innerHTML = '<div style="color:#3498db;">正在筛选并入库，请稍候（可能需要几分钟）...</div>';
            }

            try {
                // 获取阈值参数
                let threshold = 50.0;
                const thInput = document.getElementById('valueThreshold');
                if (thInput && thInput.value !== undefined && thInput.value !== null && thInput.value !== '') {
                    const v = parseFloat(thInput.value);
                    if (!Number.isNaN(v) && Number.isFinite(v) && v >= 0) {
                        threshold = v;
                    }
                }

                // 使用已上传的文件信息，调用筛选入库接口
                const formData = new FormData();
                // 需要重新读取文件（因为后端需要文件内容）
                const fileInput = document.getElementById('interpolationFileInput');
                const file = fileInput?.files[0];
                if (!file) {
                    throw new Error('文件已丢失，请重新上传');
                }
                formData.append('file', file);
                formData.append('confirmed_date', confirmedDate);
                formData.append('value_threshold', String(threshold));

                const res = await fetch('/python/rain/process-upload', { method: 'POST', body: formData });
                if (!res.ok) {
                    let msg = `入库失败 (HTTP ${res.status})`;
                    try { const e = await res.json(); msg = e.error || msg; } catch {}
                    throw new Error(msg);
                }
                const data = await res.json();
                if (!data.success) throw new Error(data.error || '入库失败');

                // 显示入库成功信息
                if (status) {
                    status.innerHTML = `<div style="color:#27ae60;">✅ 筛选入库完成！新增 ${data.inserted} 条</div>`;
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
                    status.innerHTML = `<div style="color:#e74c3c;">❌ 筛选入库失败：${(err && err.message) || err}</div>`;
                }
            } finally {
                btn.disabled = false;
                btn.textContent = '💾 筛选入库';
            }
        });
    }
    
    // 运行空间插值分析
    const btnRun = document.getElementById('btnRunInterpolation');
    if (btnRun) {
        btnRun.addEventListener('click', async function() {
            if (!uploadedFileInfo) {
                alert('请先上传数据文件');
                return;
            }
            
            const btn = this;
            const status = document.getElementById('interpolationStatus');
            // 阈值：默认50，可由用户输入覆盖
            let threshold = 50.0;
            const thInput = document.getElementById('valueThreshold');
            if (thInput && thInput.value !== undefined && thInput.value !== null && thInput.value !== '') {
                const v = parseFloat(thInput.value);
                if (!Number.isNaN(v) && Number.isFinite(v) && v >= 0) {
                    threshold = v;
                }
            }
            
            btn.disabled = true;
            btn.textContent = '🗺️ 处理中...';
            if (status) {
                status.style.display = 'block';
                status.innerHTML = '<div style="color: #3498db;">正在运行空间插值分析，请稍候（可能需要几分钟）...</div>';
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
                btn.textContent = '🗺️ 运行空间插值';
            }
        });
    }
}

