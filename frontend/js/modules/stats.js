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
            document.getElementById('totalRecords').textContent = data.total_records ?? 0;
            document.getElementById('processedRecords').textContent = data.processed_records ?? 0;
            document.getElementById('averageRisk').textContent = (data.average_risk ?? 0).toFixed(2);
            document.getElementById('maxWaterLevel').textContent = data.max_water_level ?? 0;
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

