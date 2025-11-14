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
  // TODO: 重构为使用 rain_event 表
  // 暂时禁用，等待重构
  console.log(`[Trigger] Rainfall detected but not saved (refactoring in progress): ${data.precipitation}mm/h at (${data.latitude}, ${data.longitude})`);
  return 0;
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

