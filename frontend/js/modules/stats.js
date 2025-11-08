/**
 * 统计数据模块
 */

/**
 * 加载统计数据
 */
async function loadStats() {
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

