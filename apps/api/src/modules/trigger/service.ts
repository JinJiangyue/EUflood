import { TRIGGER_CONFIG, getCountryFromCoordinates } from './config';
import { db } from '../../db';
import { generateRecordId, calculateConfidence } from '../ingestion/utils';

// 根据降雨量推断严重程度
function inferSeverityFromPrecipitation(currentPrecip: number, dailyPrecip?: number): string {
  // 根据降雨强度判断
  if (currentPrecip >= 20) return 'extreme'; // 暴雨
  if (currentPrecip >= 10) return 'high'; // 大雨
  if (currentPrecip >= 5) return 'medium'; // 中雨
  if (dailyPrecip && dailyPrecip >= 50) return 'high'; // 24小时累计大雨
  if (dailyPrecip && dailyPrecip >= 25) return 'medium'; // 24小时累计中雨
  return 'low';
}

interface PrecipitationData {
  latitude: number;
  longitude: number;
  time: string;
  precipitation: number; // mm/h
  precipitation24h?: number; // mm/24h
}

interface TriggerResult {
  triggered: boolean;
  location: { lat: number; lon: number; country: string | null };
  precipitation: number;
  timestamp: string;
  recordsCreated: number;
}

// 从Open-Meteo API获取实时降雨数据
export async function checkOpenMeteoPrecipitation(): Promise<TriggerResult[]> {
  const results: TriggerResult[] = [];
  
  for (const point of TRIGGER_CONFIG.openMeteo.monitoringPoints) {
    try {
      const url = `${TRIGGER_CONFIG.openMeteo.baseUrl}?latitude=${point.lat}&longitude=${point.lon}&current=precipitation&hourly=precipitation&daily=precipitation_sum&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const data = await response.json();
      const currentPrecip = data.current?.precipitation || 0;
      const dailyPrecip = data.daily?.precipitation_sum?.[0] || 0;
      
      // 检查是否超过阈值
      const triggered = currentPrecip >= TRIGGER_CONFIG.openMeteo.thresholds.precipitation ||
                       dailyPrecip >= TRIGGER_CONFIG.openMeteo.thresholds.precipitation24h;
      
      if (triggered) {
        const country = getCountryFromCoordinates(point.lat, point.lon) || point.country;
        const recordsCreated = await createTriggerRecord({
          latitude: point.lat,
          longitude: point.lon,
          time: new Date().toISOString(),
          precipitation: currentPrecip,
          precipitation24h: dailyPrecip
        }, country, 'open_meteo');
        
        results.push({
          triggered: true,
          location: { lat: point.lat, lon: point.lon, country },
          precipitation: currentPrecip,
          timestamp: new Date().toISOString(),
          recordsCreated
        });
      }
    } catch (error) {
      console.error(`Error checking ${point.name}:`, error);
    }
  }
  
  return results;
}

// 创建触发器记录并调用对应国家数据源
async function createTriggerRecord(
  data: PrecipitationData,
  country: string,
  triggerSource: string
): Promise<number> {
  const recordId = generateRecordId({
    country,
    specific_location: `${data.latitude},${data.longitude}`,
    event_time: data.time,
    coordinates: JSON.stringify({ type: 'Point', coordinates: [data.longitude, data.latitude] }),
    title: `Rainfall detected: ${data.precipitation}mm/h`,
    source_url: `https://api.open-meteo.com/v1/forecast`
  });
  
  const insert = db.prepare(`
    INSERT INTO flood_records (
      record_id, title, description, water_level, country, specific_location, event_time,
      coordinates, severity, type, status,
      source_type, source_name, source_url, language_code, confidence, evidence_count, metadata, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, 1, ?, datetime('now'))
  `);
  
  const title = `${country} - Rainfall Alert (${data.precipitation}mm/h)`;
  const description = `Triggered by ${triggerSource}. Current precipitation: ${data.precipitation}mm/h${data.precipitation24h ? `, 24h total: ${data.precipitation24h}mm` : ''}`;
  // 根据降雨量推断严重程度（降雨量转换为类似水位的影响等级）
  const severity = inferSeverityFromPrecipitation(data.precipitation, data.precipitation24h);
  const confidence = calculateConfidence('sensor', true, false, true, 1); // 传感器数据，高置信度
  
  insert.run(
    recordId, title, description, null, country, `${data.latitude},${data.longitude}`,
    data.time, JSON.stringify({ type: 'Point', coordinates: [data.longitude, data.latitude] }),
    severity, 'warning', 'sensor', triggerSource, 'https://api.open-meteo.com/v1/forecast',
    'en', confidence, JSON.stringify({ trigger_source: triggerSource, precipitation: data.precipitation, precipitation24h: data.precipitation24h })
  );
  
  // 触发对应国家数据源采集
  await triggerCountryDataSource(country, { lat: data.latitude, lon: data.longitude });
  
  return 1;
}

// 根据国家调用对应数据源
async function triggerCountryDataSource(country: string, location: { lat: number; lon: number }): Promise<void> {
  const dataSource = TRIGGER_CONFIG.countryMapping[country as keyof typeof TRIGGER_CONFIG.countryMapping];
  if (!dataSource) {
    console.log(`No data source configured for ${country}`);
    return;
  }
  
  // 这里应该调用对应的数据源模块
  // 例如：await collectFromAEMET(location) 或 await collectFromRSS('france24', country)
  console.log(`Triggering ${dataSource} for ${country} at (${location.lat}, ${location.lon})`);
  
  // TODO: 实现具体的国家数据源调用
  // 示例：
  // if (dataSource === 'aemet') {
  //   await import('../data-sources/api-key-required/aemet/service').then(m => m.collectAEMETData(location));
  // } else if (dataSource === 'france24') {
  //   await import('../data-sources/news-websites/france24/service').then(m => m.collectFrance24RSS(country));
  // }
}

// 定时检查任务入口
export async function runTriggerCheck(): Promise<{ checked: number; triggered: number }> {
  const results = await checkOpenMeteoPrecipitation();
  return {
    checked: TRIGGER_CONFIG.openMeteo.monitoringPoints.length,
    triggered: results.filter(r => r.triggered).length
  };
}

