-- 搜索状态追踪表迁移脚本
-- 创建时间: 2025-11-02
-- 描述: 创建搜索会话、搜索结果和搜索缓存表

-- 1. 创建搜索会话表
CREATE TABLE IF NOT EXISTS search_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    search_type VARCHAR(50) NOT NULL DEFAULT 'general',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    user_id UUID,
    ip_address INET,
    user_agent TEXT
);

-- 2. 创建搜索结果表
CREATE TABLE IF NOT EXISTS search_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES search_sessions(id) ON DELETE CASCADE,
    source VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    url TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    relevance_score DECIMAL(3,2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
    data_type VARCHAR(50) DEFAULT 'general',
    language VARCHAR(10),
    country VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    -- 唯一约束防止同一会话中重复结果
    UNIQUE(session_id, url, title)
);

-- 3. 创建搜索缓存表
CREATE TABLE IF NOT EXISTS search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    query TEXT NOT NULL,
    parameters JSONB DEFAULT '{}',
    results_count INTEGER DEFAULT 0,
    cached_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    hit_rate DECIMAL(5,2) DEFAULT 0.00,
    cache_size_bytes INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);

-- 4. 创建防重复搜索视图
CREATE OR REPLACE VIEW recent_searches AS
SELECT 
    s.id,
    s.session_id,
    s.query,
    s.search_type,
    s.status,
    s.created_at,
    s.duration_ms,
    COUNT(r.id) as results_count,
    MAX(r.created_at) as last_result_time
FROM search_sessions s
LEFT JOIN search_results r ON s.id = r.session_id
WHERE s.created_at > NOW() - INTERVAL '1 hour'
GROUP BY s.id, s.session_id, s.query, s.search_type, s.status, s.created_at, s.duration_ms
ORDER BY s.created_at DESC;

-- 5. 创建索引优化查询性能

-- search_sessions 表索引
CREATE INDEX IF NOT EXISTS idx_search_sessions_session_id ON search_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_search_sessions_status ON search_sessions(status);
CREATE INDEX IF NOT EXISTS idx_search_sessions_created_at ON search_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_sessions_query ON search_sessions USING gin(to_tsvector('english', query));
CREATE INDEX IF NOT EXISTS idx_search_sessions_user_id ON search_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_search_sessions_search_type ON search_sessions(search_type);

-- 复合索引用于常见查询模式
CREATE INDEX IF NOT EXISTS idx_search_sessions_status_created ON search_sessions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_sessions_user_status ON search_sessions(user_id, status, created_at DESC);

-- search_results 表索引
CREATE INDEX IF NOT EXISTS idx_search_results_session_id ON search_results(session_id);
CREATE INDEX IF NOT EXISTS idx_search_results_source ON search_results(source);
CREATE INDEX IF NOT EXISTS idx_search_results_published_at ON search_results(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_results_relevance_score ON search_results(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_search_results_data_type ON search_results(data_type);
CREATE INDEX IF NOT EXISTS idx_search_results_language ON search_results(language);
CREATE INDEX IF NOT EXISTS idx_search_results_country ON search_results(country);

-- 复合索引
CREATE INDEX IF NOT EXISTS idx_search_results_session_relevance ON search_results(session_id, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_search_results_source_published ON search_results(source, published_at DESC);

-- search_cache 表索引
CREATE INDEX IF NOT EXISTS idx_search_cache_cache_key ON search_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires_at ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_query ON search_cache USING gin(to_tsvector('english', query));
CREATE INDEX IF NOT EXISTS idx_search_cache_access_count ON search_cache(access_count DESC);
CREATE INDEX IF NOT EXISTS idx_search_cache_hit_rate ON search_cache(hit_rate DESC);

-- 复合索引
CREATE INDEX IF NOT EXISTS idx_search_cache_expires_access ON search_cache(expires_at, access_count DESC);

-- 6. 创建更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. 创建触发器自动更新 updated_at
CREATE TRIGGER update_search_sessions_updated_at 
    BEFORE UPDATE ON search_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_search_cache_updated_at 
    BEFORE UPDATE ON search_cache 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 创建缓存过期清理函数
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM search_cache 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 9. 创建防重复搜索函数
CREATE OR REPLACE FUNCTION check_recent_search(
    p_query TEXT,
    p_search_type TEXT DEFAULT 'general',
    p_time_window INTERVAL DEFAULT INTERVAL '5 minutes'
)
RETURNS TABLE(
    session_id UUID,
    status VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE,
    results_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.status,
        s.created_at,
        COUNT(r.id) as results_count
    FROM search_sessions s
    LEFT JOIN search_results r ON s.id = r.session_id
    WHERE s.query = p_query 
        AND s.search_type = p_search_type
        AND s.created_at > NOW() - p_time_window
        AND s.status IN ('pending', 'processing', 'completed')
    GROUP BY s.id, s.status, s.created_at
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 10. 创建缓存命中率统计视图
CREATE OR REPLACE VIEW cache_statistics AS
SELECT 
    DATE_TRUNC('day', created_at) as cache_date,
    COUNT(*) as total_caches,
    COUNT(CASE WHEN last_accessed_at IS NOT NULL THEN 1 END) as accessed_caches,
    AVG(hit_rate) as avg_hit_rate,
    AVG(access_count) as avg_access_count,
    SUM(cache_size_bytes) as total_cache_size
FROM search_cache
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY cache_date DESC;

-- 11. 创建搜索性能统计视图
CREATE OR REPLACE VIEW search_performance_stats AS
SELECT 
    DATE_TRUNC('hour', created_at) as search_hour,
    search_type,
    COUNT(*) as total_searches,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_searches,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_searches,
    AVG(duration_ms) as avg_duration_ms,
    MAX(duration_ms) as max_duration_ms,
    MIN(duration_ms) as min_duration_ms
FROM search_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), search_type
ORDER BY search_hour DESC, search_type;

-- 12. 创建自动清理过期缓存的定时任务（可选）
-- 注意: 这需要 pg_cron 扩展
-- SELECT cron.schedule('cleanup-expired-cache', '0 */6 * * *', 'SELECT cleanup_expired_cache();');

-- 13. 添加注释
COMMENT ON TABLE search_sessions IS '搜索会话表，记录所有搜索请求的详细信息';
COMMENT ON TABLE search_results IS '搜索结果表，存储外部搜索返回的结果数据';
COMMENT ON TABLE search_cache IS '搜索缓存表，缓存搜索结果以提高性能';

COMMENT ON COLUMN search_sessions.session_id IS '搜索会话标识符，用于关联相关搜索';
COMMENT ON COLUMN search_sessions.search_type IS '搜索类型：general, news, academic, social等';
COMMENT ON COLUMN search_sessions.status IS '搜索状态：pending-等待中, processing-处理中, completed-已完成, failed-失败, cancelled-已取消';
COMMENT ON COLUMN search_sessions.duration_ms IS '搜索耗时（毫秒）';
COMMENT ON COLUMN search_sessions.metadata IS '额外的元数据，如搜索参数、过滤器等';

COMMENT ON COLUMN search_results.source IS '数据源标识，如google, bing, twitter等';
COMMENT ON COLUMN search_results.relevance_score IS '相关性评分，0-1之间的数值';
COMMENT ON COLUMN search_results.data_type IS '数据类型：article, tweet, image, video等';

COMMENT ON COLUMN search_cache.cache_key IS '缓存键，基于查询和参数生成的唯一标识';
COMMENT ON COLUMN search_cache.hit_rate IS '缓存命中率百分比';
COMMENT ON COLUMN search_cache.cache_size_bytes IS '缓存数据大小（字节）';

-- 14. 创建基础权限策略（根据需要调整）
-- 启用行级安全
ALTER TABLE search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

-- 允许所有用户读取搜索会话（可根据需要修改）
CREATE POLICY "Allow read access to search sessions" ON search_sessions
    FOR SELECT USING (true);

-- 允许所有用户创建搜索会话
CREATE POLICY "Allow insert search sessions" ON search_sessions
    FOR INSERT WITH CHECK (true);

-- 允许所有用户读取搜索结果
CREATE POLICY "Allow read access to search results" ON search_results
    FOR SELECT USING (true);

-- 允许所有用户创建搜索结果
CREATE POLICY "Allow insert search results" ON search_results
    FOR INSERT WITH CHECK (true);

-- 允许所有用户读取缓存
CREATE POLICY "Allow read access to search cache" ON search_cache
    FOR SELECT USING (true);

-- 允许所有用户创建缓存
CREATE POLICY "Allow insert search cache" ON search_cache
    FOR INSERT WITH CHECK (true);

-- 允许更新缓存访问统计
CREATE POLICY "Allow update cache access stats" ON search_cache
    FOR UPDATE USING (true);

-- 迁移完成提示
DO $$
BEGIN
    RAISE NOTICE '搜索状态追踪表创建完成！';
    RAISE NOTICE '已创建表：search_sessions, search_results, search_cache';
    RAISE NOTICE '已创建索引和视图用于性能优化';
    RAISE NOTICE '已创建防重复搜索和缓存管理功能';
END $$;

