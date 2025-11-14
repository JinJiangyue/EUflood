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
}


