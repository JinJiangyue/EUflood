-- Migration: create_flood_monitoring_tables
-- Created at: 1761981762

-- 洪水事件主表
CREATE TABLE flood_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  country_code VARCHAR(2) NOT NULL,
  region TEXT,
  severity_level INTEGER CHECK (severity_level BETWEEN 1 AND 4),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'monitoring')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 数据源记录表
CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('official_api', 'social_media', 'news', 'sensor')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  language_code VARCHAR(5),
  raw_content TEXT,
  translated_content TEXT,
  confidence_score DECIMAL(3, 2) CHECK (confidence_score BETWEEN 0 AND 1),
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 影响评估表
CREATE TABLE event_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  impact_type VARCHAR(50) NOT NULL CHECK (impact_type IN ('traffic', 'economic', 'safety', 'emergency_response')),
  
  -- 交通影响
  roads_blocked_km DECIMAL(10, 2),
  traffic_delay_hours DECIMAL(10, 2),
  bridges_damaged INTEGER,
  
  -- 经济影响
  direct_economic_loss DECIMAL(15, 2),
  indirect_economic_loss DECIMAL(15, 2),
  gdp_impact_percentage DECIMAL(5, 2),
  
  -- 居民安全
  casualties INTEGER,
  evacuated_people INTEGER,
  houses_damaged INTEGER,
  houses_destroyed INTEGER,
  
  -- 应急响应
  response_time_minutes INTEGER,
  rescue_personnel INTEGER,
  resources_deployed TEXT,
  
  assessment_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 事件时间线表
CREATE TABLE event_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  timeline_type VARCHAR(50) NOT NULL CHECK (timeline_type IN ('warning_issued', 'flood_started', 'peak_reached', 'evacuation_ordered', 'rescue_deployed', 'flood_receding', 'recovery_started')),
  title TEXT NOT NULL,
  description TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  source_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_flood_events_country ON flood_events(country_code);
CREATE INDEX idx_flood_events_severity ON flood_events(severity_level);
CREATE INDEX idx_flood_events_date ON flood_events(start_date);
CREATE INDEX idx_flood_events_status ON flood_events(status);
CREATE INDEX idx_data_sources_event ON data_sources(event_id);
CREATE INDEX idx_data_sources_type ON data_sources(source_type);
CREATE INDEX idx_event_impacts_event ON event_impacts(event_id);
CREATE INDEX idx_event_impacts_type ON event_impacts(impact_type);
CREATE INDEX idx_event_timeline_event ON event_timeline(event_id);
CREATE INDEX idx_event_timeline_timestamp ON event_timeline(timestamp);

-- 启用 Row Level Security (RLS)
ALTER TABLE flood_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_timeline ENABLE ROW LEVEL SECURITY;

-- 创建公开访问策略（因为无需用户认证）
CREATE POLICY "Allow public read access on flood_events" ON flood_events
  FOR SELECT USING (true);

CREATE POLICY "Allow service role write access on flood_events" ON flood_events
  FOR ALL USING (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow public read access on data_sources" ON data_sources
  FOR SELECT USING (true);

CREATE POLICY "Allow service role write access on data_sources" ON data_sources
  FOR ALL USING (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow public read access on event_impacts" ON event_impacts
  FOR SELECT USING (true);

CREATE POLICY "Allow service role write access on event_impacts" ON event_impacts
  FOR ALL USING (auth.role() IN ('anon', 'service_role'));

CREATE POLICY "Allow public read access on event_timeline" ON event_timeline
  FOR SELECT USING (true);

CREATE POLICY "Allow service role write access on event_timeline" ON event_timeline
  FOR ALL USING (auth.role() IN ('anon', 'service_role'));

