/**
 * 国际化（i18n）模块
 * 支持中文和英文双语切换
 */

// 翻译数据（从独立的JSON文件加载）
let translations = {
    zh: {},
    en: {},
    es: {}
};

// 是否已加载翻译数据
let translationsLoaded = false;

/**
 * 加载翻译数据（从独立的语言文件加载）
 */
async function loadTranslations() {
    if (translationsLoaded) {
        return Promise.resolve();
    }
    
    // 支持的语言列表
    const supportedLanguages = ['zh', 'en', 'es'];
    
    try {
        // 并行加载所有语言文件
        const loadPromises = supportedLanguages.map(async (lang) => {
            try {
                const response = await fetch(`frontend/js/i18n/${lang}.json`);
                if (response.ok) {
                    const data = await response.json();
                    translations[lang] = data;
                } else {
                    console.warn(`无法加载 ${lang}.json:`, response.status, response.statusText);
                    translations[lang] = {};
                }
            } catch (error) {
                console.error(`加载 ${lang}.json 时出错:`, error);
                translations[lang] = {};
            }
        });
        
        await Promise.all(loadPromises);
        translationsLoaded = true;
        
        // 检查是否至少加载了一种语言
        const loadedLanguages = Object.keys(translations).filter(lang => Object.keys(translations[lang]).length > 0);
        if (loadedLanguages.length === 0) {
            console.error('警告：未能加载任何语言文件！');
        } else {
            console.log(`已加载语言: ${loadedLanguages.join(', ')}`);
        }
    } catch (error) {
        console.error('加载翻译文件时出错:', error);
        // 如果加载失败，使用空对象（会导致显示翻译键）
        translations = { zh: {}, en: {}, es: {} };
    }
}

// 当前语言（默认中文）
const supportedLanguages = ['zh', 'en', 'es'];
const savedLang = localStorage.getItem('language');
let currentLang = (savedLang && supportedLanguages.includes(savedLang)) ? savedLang : 'zh';

/**
 * 获取翻译文本（支持点号路径，如 'table.header.date'）
 * @param {string} key - 翻译键（支持点号路径，如 'table.header.date'）
 * @param {object} params - 参数对象（用于替换占位符）
 * @returns {string} 翻译后的文本
 */
function t(key, params = {}) {
    // 支持点号路径，如 'table.header.date' -> translations['zh']['table']['header']['date']
    const keys = key.split('.');
    let translation = translations[currentLang] || translations['zh'] || {};
    
    // 遍历路径获取嵌套值
    for (const k of keys) {
        if (translation && typeof translation === 'object' && k in translation) {
            translation = translation[k];
        } else {
            // 如果找不到，尝试使用中文作为后备
            translation = translations['zh'] || {};
            for (const k2 of keys) {
                if (translation && typeof translation === 'object' && k2 in translation) {
                    translation = translation[k2];
                } else {
                    // 如果还是找不到，返回原始键
                    return key;
                }
            }
            break;
        }
    }
    
    // 如果最终值不是字符串，返回原始键
    if (typeof translation !== 'string') {
        return key;
    }
    
    // 替换占位符
    if (params && Object.keys(params).length > 0) {
        return translation.replace(/\{(\w+)\}/g, (match, paramKey) => {
            return params[paramKey] !== undefined ? params[paramKey] : match;
        });
    }
    
    return translation;
}

/**
 * 设置语言
 * @param {string} lang - 语言代码 ('zh' 或 'en')
 */
function setLanguage(lang) {
    // 支持的语言映射
    const langMap = {
        'zh': 'zh-CN',
        'en': 'en',
        'es': 'es'
    };
    
    if (translations[lang] && Object.keys(translations[lang]).length > 0) {
        currentLang = lang;
        localStorage.setItem('language', lang);
        const htmlLang = langMap[lang] || lang;
        
        // 设置HTML的lang属性，影响浏览器原生组件（如日期选择器）
        document.documentElement.lang = htmlLang;
        document.documentElement.setAttribute('lang', htmlLang);
        
        // 设置所有日期输入框的lang属性，确保日期选择器使用正确语言
        document.querySelectorAll('input[type="date"]').forEach(input => {
            input.setAttribute('lang', htmlLang);
            input.lang = htmlLang;
        });
        
        updatePageLanguage();
    } else {
        console.warn(`语言 ${lang} 未加载或为空`);
    }
}

/**
 * 更新页面语言
 */
function updatePageLanguage() {
    // 更新所有带有 data-i18n 属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const text = t(key);
        
        if (element.tagName === 'INPUT' && element.type === 'text' && element.hasAttribute('data-i18n-placeholder')) {
            const placeholderKey = element.getAttribute('data-i18n-placeholder');
            element.placeholder = t(placeholderKey);
        } else if (element.tagName === 'INPUT' && element.type === 'date') {
            // 日期输入框：通过设置lang属性，浏览器会自动更新占位符格式
            // 不需要手动设置，浏览器会根据document.documentElement.lang自动调整
        } else if (element.tagName === 'INPUT' && element.type === 'submit' || element.tagName === 'BUTTON') {
            element.textContent = text;
        } else if (element.tagName === 'OPTION') {
            element.textContent = text;
        } else {
            element.textContent = text;
        }
    });
    
    // 更新带有 data-i18n-placeholder 的 input 元素
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = t(key);
    });
    
    // 更新所有带有 data-i18n-html 属性的元素（支持HTML）
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
        const key = element.getAttribute('data-i18n-html');
        element.innerHTML = t(key);
    });
    
    // 更新所有带有 data-i18n-title 属性的元素
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = t(key);
    });
    
    // 更新页面标题
    const titleElement = document.querySelector('title[data-i18n]');
    if (titleElement) {
        const titleKey = titleElement.getAttribute('data-i18n');
        document.title = t(titleKey);
    }
    
    // 更新所有日期输入框的lang属性（影响浏览器原生日期选择器的语言）
    const langMap = {
        'zh': 'zh-CN',
        'en': 'en',
        'es': 'es'
    };
    const htmlLang = langMap[currentLang] || currentLang;
    document.querySelectorAll('input[type="date"]').forEach(input => {
        input.setAttribute('lang', htmlLang);
        input.lang = htmlLang;
    });
    
    // 触发自定义事件，通知其他模块更新
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
}

/**
 * 初始化国际化
 */
async function initI18n() {
    // 先加载翻译数据
    await loadTranslations();
    
    // 设置初始语言
    setLanguage(currentLang);
    
    // 创建语言切换器
    createLanguageSwitcher();
}

/**
 * 创建语言切换器
 */
function createLanguageSwitcher() {
    // 检查是否已存在语言切换器
    if (document.getElementById('languageSwitcher')) {
        return;
    }
    
    // 创建语言切换按钮
    const header = document.querySelector('.header');
    if (header) {
        const langSwitcher = document.createElement('div');
        langSwitcher.id = 'languageSwitcher';
        langSwitcher.style.cssText = 'position: absolute; top: 20px; right: 20px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;';
        
        // 支持的语言配置
        const languages = [
            { code: 'zh', label: '中文' },
            { code: 'en', label: 'English' },
            { code: 'es', label: 'Español' }
        ];
        
        const buttons = {};
        
        languages.forEach(lang => {
            const btn = document.createElement('button');
            btn.textContent = lang.label;
            btn.style.cssText = 'padding: 8px 16px; border: 2px solid white; background: ' + (currentLang === lang.code ? 'rgba(255,255,255,0.3)' : 'transparent') + '; color: white; border-radius: 5px; cursor: pointer; font-size: 14px; transition: background 0.2s;';
            btn.onclick = () => {
                setLanguage(lang.code);
                // 更新所有按钮的样式
                Object.keys(buttons).forEach(code => {
                    buttons[code].style.background = code === lang.code ? 'rgba(255,255,255,0.3)' : 'transparent';
                });
            };
            buttons[lang.code] = btn;
            langSwitcher.appendChild(btn);
        });
        
        // 设置header为相对定位
        header.style.position = 'relative';
        header.appendChild(langSwitcher);
    }
}

// 导出函数供其他模块使用
window.t = t;
window.setLanguage = setLanguage;
window.currentLang = currentLang;
