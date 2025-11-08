/**
 * 工具函数模块
 */

/**
 * 自定义确认对话框（居中显示）
 * @param {string} message - 确认消息
 * @returns {Promise<boolean>} - 返回 true 如果确认，false 如果取消
 */
function customConfirm(message) {
    return new Promise((resolve) => {
        const i18n = typeof t === 'function' ? t : (key) => key;
        
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // 创建对话框
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            border-radius: 10px;
            padding: 25px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            animation: fadeIn 0.2s ease-in;
        `;
        
        // 添加动画样式（如果还没有）
        if (!document.getElementById('customConfirmStyles')) {
            const style = document.createElement('style');
            style.id = 'customConfirmStyles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // 消息内容（支持换行）
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            margin-bottom: 20px;
            color: #333;
            font-size: 15px;
            line-height: 1.6;
            white-space: pre-wrap;
        `;
        messageDiv.textContent = message;
        dialog.appendChild(messageDiv);
        
        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        `;
        
        // 确认按钮
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = i18n('common.confirm');
        confirmBtn.style.cssText = `
            padding: 10px 20px;
            background: #27ae60;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        `;
        confirmBtn.onmouseover = () => confirmBtn.style.background = '#229954';
        confirmBtn.onmouseout = () => confirmBtn.style.background = '#27ae60';
        confirmBtn.onclick = () => {
            document.body.removeChild(overlay);
            resolve(true);
        };
        
        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = i18n('common.cancel');
        cancelBtn.style.cssText = `
            padding: 10px 20px;
            background: #ecf0f1;
            color: #2c3e50;
            border: 1px solid #bdc3c7;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.background = '#d5dbdb';
        cancelBtn.onmouseout = () => cancelBtn.style.background = '#ecf0f1';
        cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            resolve(false);
        };
        
        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(confirmBtn);
        dialog.appendChild(buttonContainer);
        overlay.appendChild(dialog);
        
        // 点击遮罩层关闭（可选）
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(false);
            }
        };
        
        // ESC 键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', handleEsc);
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        document.body.appendChild(overlay);
        
        // 自动聚焦确认按钮
        setTimeout(() => confirmBtn.focus(), 100);
    });
}

/**
 * HTML转义，防止XSS攻击
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleString('zh-CN');
}

/**
 * 获取严重程度CSS类
 */
function getSeverityClass(severity) {
    if (!severity) return 'severity-unknown';
    const sev = severity.toLowerCase();
    if (sev === 'extreme') return 'severity-extreme';
    if (sev === 'high') return 'severity-high';
    if (sev === 'medium') return 'severity-medium';
    return 'severity-low';
}

/**
 * 获取数据源类型标签
 */
function getSourceTypeLabel(sourceType) {
    const map = { 
        'official_api': '官方API', 
        'social_media': '社交媒体', 
        'news': '新闻', 
        'sensor': '传感器' 
    };
    return map[sourceType] || sourceType || '未知';
}

/**
 * 显示搜索结果
 */
function displayResults(results) {
    const resultsSection = document.getElementById('resultsSection');
    if (!Array.isArray(results) || results.length === 0) {
        resultsSection.innerHTML = `
            <div class="no-results">
                <h3>🔍 未找到数据</h3>
                <p>没有找到符合条件的记录</p>
            </div>
        `;
        return;
    }
    
    const resultsHTML = results.map(r => `
        <div class="result-card">
            <div class="result-header">
                <div style="flex: 1;">
                    <div class="result-title">${escapeHtml(r.title || `记录 #${r.id}`)}</div>
                    ${r.severity ? `<div class="severity-badge ${getSeverityClass(r.severity)}">${escapeHtml(r.severity)}</div>` : ''}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${r.confidence != null ? `<div class="confidence" style="font-size: 12px; color: ${r.confidence >= 0.7 ? '#27ae60' : r.confidence >= 0.5 ? '#f39c12' : '#95a5a6'};">
                        置信度: ${(r.confidence * 100).toFixed(0)}%
                    </div>` : ''}
                    ${r.evidence_count > 1 ? `<div style="font-size: 11px; color: #3498db;">📊 ${r.evidence_count}个来源</div>` : ''}
                </div>
            </div>
            <div class="result-meta">
                <div class="meta-item">
                    <div class="meta-label">国家/地区</div>
                    <div class="meta-value">${escapeHtml(r.country || '未知')}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">具体位置</div>
                    <div class="meta-value">${escapeHtml(r.specific_location || '未知')}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">事件时间</div>
                    <div class="meta-value">${formatDate(r.event_time || r.created_at)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">水位(m)</div>
                    <div class="meta-value">${r.water_level ?? '-'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">数据来源</div>
                    <div class="meta-value">${escapeHtml(getSourceTypeLabel(r.source_type))}${r.source_name ? ` (${escapeHtml(r.source_name)})` : ''}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">状态</div>
                    <div class="meta-value">${r.status || 'new'}</div>
                </div>
            </div>
            <div class="result-description">${escapeHtml(r.description || '无描述')}</div>
            ${r.source_url ? `<div class="result-footer">
                <a href="${escapeHtml(r.source_url)}" target="_blank" class="source-link">📄 查看原始来源</a>
            </div>` : ''}
        </div>
    `).join('');
    
    resultsSection.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3>📊 搜索结果 (${results.length} 条记录)</h3>
        </div>
        ${resultsHTML}
    `;
}

