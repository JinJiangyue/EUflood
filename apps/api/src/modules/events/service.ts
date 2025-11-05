import { db } from '../../db';
import { collectGDACSEvents, GDACSEvent } from './collectors/gdacs';
import { collectMeteoalarmEvents, MeteoalarmEvent } from './collectors/meteoalarm';
import { collectEFASEvents, EFASEvent } from './collectors/efas';
import { collectOpenMeteoEvents, OpenMeteoEvent } from './collectors/open-meteo';
import crypto from 'crypto';

// 生成候选事件唯一键
function generateCandidateKey(source: string, date: string, country: string, location: string): string {
  const normalized = `${source}_${date}_${country}_${location}`.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  return `${source}_${hash}`;
}

// 保存候选事件到数据库
function saveCandidate(event: {
  candidateKey: string;
  eventDate: string;
  country: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timeFrom?: string;
  timeTo?: string;
  severity?: string;
  level?: number;
  source: string;
  sourceUrl?: string;
  title?: string;
  description?: string;
  rawData?: string;
}) {
  const insert = db.prepare(`
    INSERT INTO event_candidates (
      candidate_key, event_date, country, city, latitude, longitude,
      time_from, time_to, severity, level, source, source_url,
      title, description, raw_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(candidate_key) DO NOTHING
  `);
  
  insert.run(
    event.candidateKey, event.eventDate, event.country, event.city || null,
    event.latitude || null, event.longitude || null,
    event.timeFrom || null, event.timeTo || null,
    event.severity || null, event.level || null,
    event.source, event.sourceUrl || null,
    event.title || null, event.description || null,
    event.rawData || null
  );
}

// 从数据库获取指定日期的候选事件
export function getCandidatesFromDB(date: string): any[] {
  const stmt = db.prepare(`
    SELECT id, candidate_key, event_date, country, city, latitude, longitude,
           time_from, time_to, severity, level, source, source_url,
           title, description, enriched, enriched_at, created_at
    FROM event_candidates
    WHERE event_date = ?
    ORDER BY level DESC, severity DESC, created_at DESC
  `);
  return stmt.all(date) as any[];
}

// 从数据库获取日期范围内的候选事件
export function getCandidatesFromDBRange(dateFrom: string, dateTo: string): any[] {
  const stmt = db.prepare(`
    SELECT id, candidate_key, event_date, country, city, latitude, longitude,
           time_from, time_to, severity, level, source, source_url,
           title, description, enriched, enriched_at, created_at
    FROM event_candidates
    WHERE event_date >= ? AND event_date <= ?
    ORDER BY event_date DESC, level DESC, severity DESC, created_at DESC
  `);
  return stmt.all(dateFrom, dateTo) as any[];
}

// 采集并保存候选事件（Open-Meteo + Meteoalarm + EFAS + GDACS）- 单个日期
export async function collectAndSaveCandidates(date: string): Promise<{ openMeteo: number; meteoalarm: number; efas: number; gdacs: number }> {
  return collectAndSaveCandidatesRange(date, date);
}

// 采集并保存候选事件（日期范围）
export async function collectAndSaveCandidatesRange(dateFrom: string, dateTo: string): Promise<{ openMeteo: number; meteoalarm: number; efas: number; gdacs: number }> {
  let openMeteoCount = 0;
  let meteoalarmCount = 0;
  let efasCount = 0;
  let gdacsCount = 0;
  
  // 欧盟边界框（用于Open-Meteo网格扫描）
  const euBbox = {
    north: 71.0,
    south: 35.0,
    east: 32.0,
    west: -10.0
  };
  
  // 1. 采集 Open-Meteo（历史降雨数据）
  try {
    console.log('Collecting Open-Meteo rainfall events...');
    const openMeteoEvents = await collectOpenMeteoEvents(dateFrom, dateTo, euBbox, 5.0);
    for (const event of openMeteoEvents) {
      // 使用事件的实际日期
      const eventDate = event.time.substring(0, 10);
      const candidateKey = generateCandidateKey('open_meteo', eventDate, event.country, `${event.latitude},${event.longitude}`);
      saveCandidate({
        candidateKey,
        eventDate,
        country: event.country,
        city: event.city,
        latitude: event.latitude,
        longitude: event.longitude,
        timeFrom: event.time,
        timeTo: event.time,
        severity: event.severity,
        level: event.severity === 'extreme' ? 4 : event.severity === 'high' ? 3 : event.severity === 'medium' ? 2 : 1,
        source: 'open_meteo',
        sourceUrl: 'https://api.open-meteo.com/v1/forecast',
        title: `${event.country} - Rainfall: ${event.precipitation}mm/h`,
        description: `Precipitation: ${event.precipitation}mm/h${event.precipitation24h ? `, 24h total: ${event.precipitation24h}mm` : ''}`,
        rawData: JSON.stringify(event)
      });
      openMeteoCount++;
    }
  } catch (error) {
    console.error('Open-Meteo collection error:', error);
  }
  
  // 2. 采集 Meteoalarm（按日期范围）
  try {
    console.log('Collecting Meteoalarm warnings...');
    const meteoalarmEvents = await collectMeteoalarmEvents(dateFrom, dateTo);
    for (const event of meteoalarmEvents) {
      const eventDate = event.timeFrom.substring(0, 10);
      const candidateKey = generateCandidateKey('meteoalarm', eventDate, event.country, event.region);
      saveCandidate({
        candidateKey,
        eventDate,
        country: event.country,
        city: event.region,
        latitude: event.coordinates?.lat,
        longitude: event.coordinates?.lon,
        timeFrom: event.timeFrom,
        timeTo: event.timeTo,
        severity: event.severity,
        level: event.level,
        source: 'meteoalarm',
        sourceUrl: event.sourceUrl,
        title: `${event.country} ${event.region} - ${event.eventType}`,
        description: event.description,
        rawData: JSON.stringify(event)
      });
      meteoalarmCount++;
    }
  } catch (error) {
    console.error('Meteoalarm collection error:', error);
  }
  
  // 3. 采集 EFAS（按日期范围）
  try {
    console.log('Collecting EFAS flood warnings...');
    const efasEvents = await collectEFASEvents(dateFrom, dateTo);
    for (const event of efasEvents) {
      const eventDate = event.timeFrom.substring(0, 10);
      const candidateKey = generateCandidateKey('efas', eventDate, event.country, event.region || `${event.latitude},${event.longitude}`);
      saveCandidate({
        candidateKey,
        eventDate,
        country: event.country,
        city: event.region,
        latitude: event.latitude,
        longitude: event.longitude,
        timeFrom: event.timeFrom,
        timeTo: event.timeTo,
        severity: event.severity,
        level: event.level,
        source: 'efas',
        sourceUrl: event.sourceUrl,
        title: `${event.country} - ${event.floodType} flood warning`,
        description: event.description,
        rawData: JSON.stringify(event)
      });
      efasCount++;
    }
  } catch (error) {
    console.error('EFAS collection error:', error);
  }
  
  // 4. 采集 GDACS（保留原有逻辑，但对每个日期）
  const dates: string[] = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().substring(0, 10));
  }
  
  for (const date of dates) {
    try {
      const gdacsEvents = await collectGDACSEvents(date);
      for (const event of gdacsEvents) {
        const eventDate = event.startDate || date;
        const candidateKey = generateCandidateKey('gdacs', eventDate, event.country, event.location);
        saveCandidate({
          candidateKey,
          eventDate,
          country: event.country,
          city: event.location,
          latitude: event.latitude,
          longitude: event.longitude,
          timeFrom: event.startDate,
          timeTo: event.endDate,
          severity: event.severity,
          level: event.alertLevel === 'Red' ? 4 : event.alertLevel === 'Orange' ? 3 : 2,
          source: 'gdacs',
          sourceUrl: event.sourceUrl,
          title: `${event.country} - ${event.eventType}`,
          description: event.description,
          rawData: JSON.stringify(event)
        });
        gdacsCount++;
      }
    } catch (error) {
      console.error(`GDACS collection error for ${date}:`, error);
    }
  }
  
  return { openMeteo: openMeteoCount, meteoalarm: meteoalarmCount, efas: efasCount, gdacs: gdacsCount };
}

