/**
 * 全局状态管理器
 * 管理应用的全局状态，包括查询条件、查询结果等
 */

class StateManager {
    constructor() {
        this.state = {
            // 全局查询状态
            query: {
                dateFrom: '',
                dateTo: '',
                country: '',
                results: [],
                totalCount: 0,
                loading: false,
                lastQueryTime: null,
                queryParams: null // 保存查询参数
            },
            // 当前页面
            currentPage: 'dashboard',
            // 统计数据
            stats: {
                totalRecords: 0,
                processedRecords: 0,
                averageRisk: 0,
                maxWaterLevel: 0
            }
        };
        
        // 事件监听器
        this.listeners = new Map();
    }
    
    /**
     * 获取状态
     */
    getState(path = null) {
        if (path) {
            return this._getNestedValue(this.state, path);
        }
        return this.state;
    }
    
    /**
     * 设置状态
     */
    setState(path, value) {
        const oldValue = this._getNestedValue(this.state, path);
        this._setNestedValue(this.state, path, value);
        this._notifyListeners(path, value, oldValue);
    }
    
    /**
     * 更新查询结果
     */
    updateQueryResults(results, totalCount, queryParams) {
        this.setState('query.results', results);
        this.setState('query.totalCount', totalCount);
        this.setState('query.queryParams', queryParams);
        this.setState('query.loading', false);
        this.setState('query.lastQueryTime', new Date().toISOString());
    }
    
    /**
     * 设置查询参数
     */
    setQueryParams(dateFrom, dateTo, country) {
        this.setState('query.dateFrom', dateFrom);
        this.setState('query.dateTo', dateTo);
        this.setState('query.country', country);
    }
    
    /**
     * 设置加载状态
     */
    setQueryLoading(loading) {
        this.setState('query.loading', loading);
    }
    
    /**
     * 切换页面
     */
    setCurrentPage(page) {
        this.setState('currentPage', page);
    }
    
    /**
     * 订阅状态变化
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);
        
        // 返回取消订阅函数
        return () => {
            const callbacks = this.listeners.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * 通知监听器
     */
    _notifyListeners(path, newValue, oldValue) {
        // 通知精确路径的监听器
        if (this.listeners.has(path)) {
            this.listeners.get(path).forEach(callback => {
                callback(newValue, oldValue, path);
            });
        }
        
        // 通知父路径的监听器（例如 'query' 的监听器也会收到 'query.results' 的变化）
        const pathParts = path.split('.');
        for (let i = pathParts.length - 1; i > 0; i--) {
            const parentPath = pathParts.slice(0, i).join('.');
            if (this.listeners.has(parentPath)) {
                this.listeners.get(parentPath).forEach(callback => {
                    callback(newValue, oldValue, path);
                });
            }
        }
    }
    
    /**
     * 获取嵌套值
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }
    
    /**
     * 设置嵌套值
     */
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            return current[key];
        }, obj);
        target[lastKey] = value;
    }
}

// 创建全局单例
window.appState = new StateManager();

