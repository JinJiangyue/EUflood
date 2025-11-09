/**
 * 路由系统
 * 管理页面导航和切换
 */

class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.pageContainers = new Map();
    }
    
    /**
     * 注册路由
     */
    register(path, pageId, title) {
        this.routes.set(path, {
            pageId,
            title,
            path
        });
    }
    
    /**
     * 导航到指定页面
     */
    navigate(path) {
        const route = this.routes.get(path);
        if (!route) {
            console.warn(`路由 ${path} 不存在`);
            return;
        }
        
        // 隐藏所有页面
        this.routes.forEach((r) => {
            const pageEl = document.getElementById(r.pageId);
            if (pageEl) {
                pageEl.style.display = 'none';
            }
        });
        
        // 显示目标页面
        const targetPage = document.getElementById(route.pageId);
        if (targetPage) {
            targetPage.style.display = 'block';
            // 触发页面显示事件
            this._triggerPageEvent(route.pageId, 'show');
        }
        
        // 更新导航状态
        this._updateNavigation(path);
        
        // 更新全局状态
        if (window.appState) {
            window.appState.setCurrentPage(path);
        }
        
        this.currentRoute = route;
    }
    
    /**
     * 更新导航高亮
     */
    _updateNavigation(activePath) {
        // 移除所有活动状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // 添加活动状态
        const activeItem = document.querySelector(`[data-route="${activePath}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }
    
    /**
     * 触发页面事件
     */
    _triggerPageEvent(pageId, eventType) {
        const event = new CustomEvent(`page:${eventType}`, {
            detail: { pageId }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * 初始化路由
     */
    init(defaultPath = 'dashboard') {
        // 监听导航点击
        document.addEventListener('click', (e) => {
            const navItem = e.target.closest('[data-route]');
            if (navItem) {
                e.preventDefault();
                const path = navItem.getAttribute('data-route');
                this.navigate(path);
            }
        });
        
        // 初始化默认页面
        this.navigate(defaultPath);
    }
    
    /**
     * 获取当前路由
     */
    getCurrentRoute() {
        return this.currentRoute;
    }
}

// 创建全局路由实例
window.router = new Router();

