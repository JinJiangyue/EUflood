/**
 * 搜索模块
 */

/**
 * 初始化搜索功能
 */
function initSearch() {
    const searchForm = document.getElementById('searchForm');
    if (!searchForm) return;
    
    searchForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const searchBtn = document.getElementById('searchBtn');
        const resultsSection = document.getElementById('resultsSection');
        
        searchBtn.disabled = true;
        searchBtn.textContent = '🔄 搜索中...';
        resultsSection.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>正在搜索本地数据...</p>
            </div>
        `;
        
        try {
            const formData = new FormData(e.target);
            const params = new URLSearchParams();
            const country = (formData.get('country') || '').toString();
            const date = (formData.get('date') || '').toString();
            const severity = (formData.get('severity') || '').toString();
            
            if (country) params.set('country', country);
            if (date) params.set('date', date);
            if (severity) params.set('severity', severity);
            
            const response = await fetch('/search' + (params.toString() ? ('?' + params.toString()) : ''));
            if (!response.ok) throw new Error('本地搜索失败');
            
            const data = await response.json();
            displayResults(data.items || []);
        } catch (error) {
            console.error('搜索错误:', error);
            resultsSection.innerHTML = `
                <div class="no-results">
                    <h3>❌ 搜索失败</h3>
                    <p>${error.message}</p>
                </div>
            `;
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = '🔍 搜索数据';
        }
    });
}

