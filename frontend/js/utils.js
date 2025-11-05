/**
 * 工具函数模块
 */

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

