import { db } from '../../db';
import { geocodeLocation, generateRecordId, calculateConfidence, inferSeverity } from './utils';

export type IngestOptions = { count?: number; sourceTypes?: string[] };

const COUNTRIES = ['Spain', 'Germany', 'Italy', 'France', 'Denmark'];
const CITIES: Record<string, string[]> = {
  Spain: ['Madrid', 'Barcelona', 'Valencia', 'Seville'],
  Germany: ['Berlin', 'Hamburg', 'Munich', 'Cologne'],
  Italy: ['Rome', 'Milan', 'Naples', 'Turin'],
  France: ['Paris', 'Lyon', 'Marseille', 'Nice'],
  Denmark: ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg']
};

// 模拟不同来源的数据特征
function generateOfficialApiRecord(country: string, city: string, hoursAgo: number) {
  const wl = Math.round((Math.random() * 5 + 0.1) * 10) / 10;
  const eventTime = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  const coords = geocodeLocation(country, city);
  const title = `${country} ${city} - Flood Alert`;
  const desc = `Official monitoring station reports water level ${wl}m. ${coords ? 'Location verified.' : ''}`;
  const sourceUrl = `https://api.official-weather.${country.toLowerCase()}/stations/${Math.floor(Math.random() * 1000)}`;
  const recordId = generateRecordId({ country, specific_location: city, event_time: eventTime, coordinates: coords ? JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] }) : '', title, source_url: sourceUrl });
  return {
    record_id: recordId,
    title,
    description: desc,
    water_level: wl,
    country,
    specific_location: city,
    event_time: eventTime,
    coordinates: coords ? JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] }) : null,
    severity: inferSeverity(wl),
    type: 'flood',
    source_type: 'official_api',
    source_name: `${country} Meteorological Service`,
    source_url: sourceUrl,
    language_code: 'en',
    confidence: calculateConfidence('official_api', !!coords, true, true, 1),
    metadata: JSON.stringify({ station_id: `ST-${Math.floor(Math.random() * 1000)}`, parser_version: '1.0' })
  };
}

function generateSocialMediaRecord(country: string, city: string, hoursAgo: number) {
  const wl = Math.random() > 0.5 ? Math.round((Math.random() * 4 + 0.5) * 10) / 10 : null; // 50%概率没有水位
  const eventTime = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  const coords = Math.random() > 0.7 ? geocodeLocation(country, city) : null; // 30%概率有坐标
  const title = `Flood in ${city}, ${country}`;
  const desc = wl ? `Water level around ${wl}m, roads flooded.` : `Flooding reported in ${city}. Avoid area.`;
  const sourceUrl = `https://twitter.com/user${Math.floor(Math.random() * 10000)}/status/${Date.now()}`;
  const recordId = generateRecordId({ country, specific_location: city, event_time: eventTime, coordinates: coords ? JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] }) : '', title, source_url: sourceUrl });
  return {
    record_id: recordId,
    title,
    description: desc,
    water_level: wl,
    country,
    specific_location: city,
    event_time: eventTime,
    coordinates: coords ? JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] }) : null,
    severity: inferSeverity(wl, desc),
    type: 'flood',
    source_type: 'social_media',
    source_name: 'Twitter/X',
    source_url: sourceUrl,
    language_code: 'en',
    confidence: calculateConfidence('social_media', !!coords, !!wl, true, 1),
    metadata: JSON.stringify({ platform: 'twitter', verified: false })
  };
}

function generateNewsRecord(country: string, city: string, hoursAgo: number) {
  const wl = Math.random() > 0.3 ? Math.round((Math.random() * 4.5 + 0.5) * 10) / 10 : null;
  const eventTime = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  const coords = geocodeLocation(country, city); // 新闻通常有地点
  const title = `Flood Warning Issued for ${city}, ${country}`;
  const desc = wl ? `Authorities report water levels reaching ${wl}m. Residents advised to stay alert.` : `Flood warning issued for ${city} area.`;
  const sourceUrl = `https://news.${country.toLowerCase()}.com/flood/${Date.now()}`;
  const recordId = generateRecordId({ country, specific_location: city, event_time: eventTime, coordinates: coords ? JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] }) : '', title, source_url: sourceUrl });
  return {
    record_id: recordId,
    title,
    description: desc,
    water_level: wl,
    country,
    specific_location: city,
    event_time: eventTime,
    coordinates: coords ? JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] }) : null,
    severity: inferSeverity(wl, desc),
    type: 'warning',
    source_type: 'news',
    source_name: `${country} News Agency`,
    source_url: sourceUrl,
    language_code: 'en',
    confidence: calculateConfidence('news', !!coords, !!wl, true, 1),
    metadata: JSON.stringify({ publisher: 'official_news', verified: true })
  };
}

export function ingestDemoFloodRecords(options: IngestOptions = {}): number {
  // TODO: 重构为使用 rain_event 和 rain_flood_impact 表
  // 暂时禁用，等待重构
  return 0;
  
  /* 注释掉：使用 flood_records 表的旧代码
  const count = Math.max(1, Math.min(1000, options.count ?? 10));
  const sourceTypes = options.sourceTypes || ['official_api', 'social_media', 'news'];
  
  const checkExisting = db.prepare('SELECT confidence, evidence_count, metadata FROM flood_records WHERE record_id = ?');
  const insert = db.prepare(`
    INSERT INTO flood_records (
      record_id, title, description, water_level, country, specific_location, event_time,
      coordinates, severity, type, status,
      source_type, source_name, source_url, language_code, confidence, evidence_count, metadata, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const updateMerge = db.prepare(`
    UPDATE flood_records SET
      evidence_count = evidence_count + 1,
      confidence = ?,
      metadata = ?
    WHERE record_id = ?
  `);

  const txn = db.transaction((n: number, sources: string[]) => {
    for (let i = 0; i < n; i++) {
      const country = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
      const cityList = CITIES[country] || ['Unknown'];
      const city = cityList[Math.floor(Math.random() * cityList.length)];
      const hoursAgo = Math.floor(Math.random() * 72);
      const sourceType = sources[Math.floor(Math.random() * sources.length)] as 'official_api' | 'social_media' | 'news';
      
      let record: any;
      if (sourceType === 'official_api') {
        record = generateOfficialApiRecord(country, city, hoursAgo);
      } else if (sourceType === 'social_media') {
        record = generateSocialMediaRecord(country, city, hoursAgo);
      } else {
        record = generateNewsRecord(country, city, hoursAgo);
      }
      
      // 检查是否已存在（去重）
      const existing = checkExisting.get(record.record_id) as any;
      if (existing) {
        // 多源合并：提升置信度
        const newCount = existing.evidence_count + 1;
        const newConfidence = calculateConfidence(
          record.source_type as any,
          !!record.coordinates,
          !!record.water_level,
          !!record.event_time,
          newCount
        );
        const finalConfidence = Math.max(existing.confidence || 0, newConfidence);
        // 更新 metadata
        let meta: any = {};
        try {
          meta = existing.metadata ? JSON.parse(existing.metadata) : {};
        } catch {}
        meta.merged = (meta.merged || 0) + 1;
        meta.last_updated = new Date().toISOString();
        updateMerge.run(finalConfidence, JSON.stringify(meta), record.record_id);
      } else {
        // 新记录
        insert.run(
          record.record_id, record.title, record.description, record.water_level, record.country,
          record.specific_location, record.event_time, record.coordinates, record.severity, record.type,
          record.source_type, record.source_name, record.source_url, record.language_code,
          record.confidence, 1, record.metadata
        );
      }
    }
  });
  
  txn(count, sourceTypes);
  return count;
  */
}


