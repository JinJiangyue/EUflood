// 事件合并模块：多平台查询 + 合并相同事件

import { db } from '../../db';
import { collectGDACSEvents, GDACSEvent } from './collectors/gdacs';
import { collectMeteoalarmEvents, MeteoalarmEvent } from './collectors/meteoalarm';
import { isSameEvent, generateGlobalEventKey } from './matching';
import crypto from 'crypto';

interface MergedEvent {
  id: number;
  globalEventKey: string;
  eventDate: string;
  country: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timeFrom?: string;
  timeTo?: string;
  severity: string;
  level: number;
  sources: string[]; // 数据源列表：['gdacs', 'meteoalarm']
  sourceCount: number;
  titles: string[];
  descriptions: string[];
  sourceUrls: string[];
  enriched: boolean;
  createdAt: string;
}

/**
 * 从多个平台查询事件并合并相同事件
 * @param dateFrom 开始日期
 * @param dateTo 结束日期
 * @returns 合并后的事件列表
 */
export async function queryAndMergeEvents(dateFrom: string, dateTo: string): Promise<{
  mergedEvents: MergedEvent[];
  stats: {
    gdacs: number;
    meteoalarm: number;
    total: number;
    merged: number;
  };
}> {
  // 1. 从多个平台采集事件
  const allCandidates = await collectFromAllPlatforms(dateFrom, dateTo);
  
  // 2. 合并相同事件
  const mergedEvents = mergeEvents(allCandidates);
  
  // 3. 保存到数据库
  await saveMergedEvents(mergedEvents);
  
  return {
    mergedEvents,
    stats: {
      gdacs: allCandidates.filter(c => c.source === 'gdacs').length,
      meteoalarm: allCandidates.filter(c => c.source === 'meteoalarm').length,
      total: allCandidates.length,
      merged: mergedEvents.length
    }
  };
}

/**
 * 从所有平台采集事件
 */
async function collectFromAllPlatforms(dateFrom: string, dateTo: string): Promise<any[]> {
  const allEvents: any[] = [];
  const dates = generateDateRange(dateFrom, dateTo);
  
  // 采集 GDACS
  for (const date of dates) {
    try {
      const gdacsEvents = await collectGDACSEvents(date);
      for (const event of gdacsEvents) {
        allEvents.push({
          source: 'gdacs',
          event_date: event.startDate || date,
          country: event.country,
          city: event.location,
          latitude: event.latitude,
          longitude: event.longitude,
          time_from: event.startDate,
          time_to: event.endDate,
          severity: event.severity,
          level: event.alertLevel === 'Red' ? 4 : event.alertLevel === 'Orange' ? 3 : 2,
          source_url: event.sourceUrl,
          title: `${event.country} - ${event.eventType}`,
          description: event.description,
          raw_data: JSON.stringify(event)
        });
      }
    } catch (error) {
      console.error(`GDACS collection error for ${date}:`, error);
    }
  }
  
  // 采集 Meteoalarm
  const priorityCountries = ['ES', 'FR', 'IT', 'CZ', 'SE', 'FI'];
  for (const date of dates) {
    try {
      for (const countryCode of priorityCountries) {
        const events = await collectMeteoalarmEvents(date, date);
        for (const event of events) {
          if (event.country !== countryCode) continue;
          allEvents.push({
            source: 'meteoalarm',
            event_date: date,
            country: event.country,
            city: event.region,
            latitude: event.coordinates?.lat,
            longitude: event.coordinates?.lon,
            time_from: event.timeFrom,
            time_to: event.timeTo,
            severity: event.severity,
            level: event.level,
            source_url: event.sourceUrl,
            title: `${event.country} ${event.region} - ${event.eventType}`,
            description: event.description,
            raw_data: JSON.stringify(event)
          });
        }
      }
    } catch (error) {
      console.error(`Meteoalarm collection error for ${date}:`, error);
    }
  }
  
  return allEvents;
}

/**
 * 合并相同事件（基于匹配规则）
 */
function mergeEvents(events: any[]): MergedEvent[] {
  const merged: MergedEvent[] = [];
  const processed = new Set<number>();
  
  for (let i = 0; i < events.length; i++) {
    if (processed.has(i)) continue;
    
    const event1 = events[i];
    const mergedEvent: MergedEvent = {
      id: 0, // 数据库ID
      globalEventKey: generateGlobalEventKey(event1),
      eventDate: event1.event_date,
      country: event1.country,
      city: event1.city,
      latitude: event1.latitude,
      longitude: event1.longitude,
      timeFrom: event1.time_from,
      timeTo: event1.time_to,
      severity: event1.severity || 'low',
      level: event1.level || 1,
      sources: [event1.source],
      sourceCount: 1,
      titles: [event1.title || ''],
      descriptions: [event1.description || ''],
      sourceUrls: [event1.source_url || ''],
      enriched: false,
      createdAt: new Date().toISOString()
    };
    
    // 查找相同事件
    for (let j = i + 1; j < events.length; j++) {
      if (processed.has(j)) continue;
      
      const event2 = events[j];
      if (isSameEvent(event1, event2)) {
        // 合并事件
        if (!mergedEvent.sources.includes(event2.source)) {
          mergedEvent.sources.push(event2.source);
          mergedEvent.sourceCount++;
        }
        mergedEvent.titles.push(event2.title || '');
        mergedEvent.descriptions.push(event2.description || '');
        mergedEvent.sourceUrls.push(event2.source_url || '');
        
        // 选择更准确的坐标（优先使用非零坐标）
        if (!mergedEvent.latitude && event2.latitude) {
          mergedEvent.latitude = event2.latitude;
          mergedEvent.longitude = event2.longitude;
        }
        
        // 选择更严重的等级
        if (event2.level > mergedEvent.level) {
          mergedEvent.level = event2.level;
          mergedEvent.severity = event2.severity || mergedEvent.severity;
        }
        
        processed.add(j);
      }
    }
    
    merged.push(mergedEvent);
    processed.add(i);
  }
  
  return merged;
}

/**
 * 保存合并后的事件到数据库
 */
async function saveMergedEvents(events: MergedEvent[]): Promise<void> {
  // 先检查表是否存在，如果不存在则创建
  ensureMergedEventsTable();
  
  for (const event of events) {
    const insert = db.prepare(`
      INSERT INTO merged_flood_events (
        global_event_key, event_date, country, city, latitude, longitude,
        time_from, time_to, severity, level,
        sources, source_count, titles, descriptions, source_urls,
        enriched, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(global_event_key) DO UPDATE SET
        source_count = excluded.source_count,
        sources = excluded.sources,
        titles = excluded.titles,
        descriptions = excluded.descriptions,
        source_urls = excluded.source_urls,
        severity = excluded.severity,
        level = excluded.level
    `);
    
    insert.run(
      event.globalEventKey,
      event.eventDate,
      event.country,
      event.city || null,
      event.latitude || null,
      event.longitude || null,
      event.timeFrom || null,
      event.timeTo || null,
      event.severity,
      event.level,
      JSON.stringify(event.sources),
      event.sourceCount,
      JSON.stringify(event.titles),
      JSON.stringify(event.descriptions),
      JSON.stringify(event.sourceUrls),
      event.enriched ? 1 : 0
    );
  }
}

/**
 * 确保合并事件表存在
 */
function ensureMergedEventsTable(): void {
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='merged_flood_events'
  `).get();
  
  if (!tableExists) {
    db.exec(`
      CREATE TABLE merged_flood_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        global_event_key TEXT UNIQUE,
        event_date TEXT NOT NULL,
        country TEXT NOT NULL,
        city TEXT,
        latitude REAL,
        longitude REAL,
        time_from TEXT,
        time_to TEXT,
        severity TEXT,
        level INTEGER,
        sources TEXT,              -- JSON: ['gdacs', 'meteoalarm']
        source_count INTEGER DEFAULT 1,
        titles TEXT,               -- JSON: ['title1', 'title2']
        descriptions TEXT,         -- JSON: ['desc1', 'desc2']
        source_urls TEXT,          -- JSON: ['url1', 'url2']
        enriched BOOLEAN DEFAULT 0,
        enriched_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_merged_events_date ON merged_flood_events(event_date);
      CREATE INDEX IF NOT EXISTS idx_merged_events_country ON merged_flood_events(country);
      CREATE INDEX IF NOT EXISTS idx_merged_events_global_key ON merged_flood_events(global_event_key);
    `);
  }
}

/**
 * 生成日期范围
 */
function generateDateRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().substring(0, 10));
  }
  return dates;
}

/**
 * 从数据库获取合并后的事件
 */
export function getMergedEventsFromDB(dateFrom: string, dateTo: string): MergedEvent[] {
  ensureMergedEventsTable();
  
  const stmt = db.prepare(`
    SELECT id, global_event_key, event_date, country, city, latitude, longitude,
           time_from, time_to, severity, level, sources, source_count,
           titles, descriptions, source_urls, enriched, created_at
    FROM merged_flood_events
    WHERE event_date >= ? AND event_date <= ?
    ORDER BY event_date DESC, level DESC, severity DESC, source_count DESC
  `);
  
  const rows = stmt.all(dateFrom, dateTo) as any[];
  
  return rows.map(row => ({
    id: row.id,
    globalEventKey: row.global_event_key,
    eventDate: row.event_date,
    country: row.country,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    timeFrom: row.time_from,
    timeTo: row.time_to,
    severity: row.severity,
    level: row.level,
    sources: JSON.parse(row.sources || '[]'),
    sourceCount: row.source_count,
    titles: JSON.parse(row.titles || '[]'),
    descriptions: JSON.parse(row.descriptions || '[]'),
    sourceUrls: JSON.parse(row.source_urls || '[]'),
    enriched: row.enriched === 1,
    createdAt: row.created_at
  }));
}

