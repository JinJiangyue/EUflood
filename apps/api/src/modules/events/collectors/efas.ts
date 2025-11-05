// EFAS (European Flood Awareness System) 数据采集器
// EFAS 是欧盟官方的洪水预警系统
// 需要API Key，需要在 EFAS 官方网站注册

export interface EFASEvent {
  eventId: string;
  country: string;
  region?: string;
  latitude: number;
  longitude: number;
  timeFrom: string;
  timeTo: string;
  severity: string;
  level: number;
  floodType: string; // river, flash, coastal
  description: string;
  sourceUrl?: string;
}

/**
 * 采集EFAS洪水预警事件（按日期范围）
 * @param dateFrom 开始日期 (YYYY-MM-DD)
 * @param dateTo 结束日期 (YYYY-MM-DD)
 * @returns 洪水事件列表
 */
export async function collectEFASEvents(dateFrom: string, dateTo: string): Promise<EFASEvent[]> {
  const events: EFASEvent[] = [];
  const apiKey = process.env.EFAS_API_KEY;
  const apiUrl = process.env.EFAS_API_URL || 'https://api.efas.eu';
  
  if (!apiKey) {
    console.warn('EFAS API Key not configured. Skipping EFAS collection.');
    console.warn('To enable EFAS, set EFAS_API_KEY in .env file.');
    console.warn('Register at https://www.efas.eu/ to get API access.');
    return events;
  }
  
  try {
    // EFAS API端点（需要根据实际API文档调整）
    // 可能的端点：
    // - GET /api/v1/flood-forecasts?date_from={dateFrom}&date_to={dateTo}
    // - GET /api/v1/flood-warnings?date_from={dateFrom}&date_to={dateTo}
    // - GET /api/v1/events?type=flood&date_from={dateFrom}&date_to={dateTo}
    
    const url = `${apiUrl}/api/v1/flood-warnings?date_from=${dateFrom}&date_to=${dateTo}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'FloodMonitor/1.0'
      }
    });
    
    if (response.status === 401) {
      console.warn('EFAS API authentication failed. Check API key.');
      return events;
    }
    
    if (response.status === 404) {
      console.warn('EFAS API endpoint not found. Check API URL configuration.');
      return events;
    }
    
    if (!response.ok) {
      console.warn(`EFAS API error: ${response.status} ${response.statusText}`);
      return events;
    }
    
    const data = await response.json();
    
    // 解析API响应（格式需要根据实际API调整）
    if (Array.isArray(data)) {
      for (const item of data) {
        const event = parseEFASEvent(item);
        if (event) {
          events.push(event);
        }
      }
    } else if (data.data && Array.isArray(data.data)) {
      // 如果响应格式为 { data: [...] }
      for (const item of data.data) {
        const event = parseEFASEvent(item);
        if (event) {
          events.push(event);
        }
      }
    } else if (data.warnings && Array.isArray(data.warnings)) {
      // 如果响应格式为 { warnings: [...] }
      for (const item of data.warnings) {
        const event = parseEFASEvent(item);
        if (event) {
          events.push(event);
        }
      }
    }
    
  } catch (error) {
    console.error('EFAS collection error:', error);
    
    // 如果API失败，尝试从EWDS（Early Warning Data Store）下载
    // EFAS也可能提供数据下载接口
    try {
      console.log('Attempting alternative EFAS data access via EWDS...');
      const ewdsEvents = await collectEFASFromEWDS(dateFrom, dateTo);
      events.push(...ewdsEvents);
    } catch (ewdsError) {
      console.error('EFAS EWDS collection error:', ewdsError);
    }
  }
  
  return events;
}

/**
 * 从EWDS（Early Warning Data Store）采集EFAS数据（备用方案）
 */
async function collectEFASFromEWDS(dateFrom: string, dateTo: string): Promise<EFASEvent[]> {
  const events: EFASEvent[] = [];
  
  try {
    // EWDS可能提供数据下载接口
    // 示例URL：https://www.efas.eu/ewds/api/v1/flood-forecasts
    // 需要根据实际EFAS文档调整
    
    const ewdsUrl = 'https://www.efas.eu/ewds/api/v1/flood-forecasts';
    
    const response = await fetch(`${ewdsUrl}?date_from=${dateFrom}&date_to=${dateTo}`, {
      headers: {
        'User-Agent': 'FloodMonitor/1.0'
      }
    });
    
    if (!response.ok) {
      return events;
    }
    
    const data = await response.json();
    
    // 解析EWDS响应
    if (Array.isArray(data)) {
      for (const item of data) {
        const event = parseEFASEvent(item);
        if (event) {
          events.push(event);
        }
      }
    }
    
  } catch (error) {
    console.error('EFAS EWDS collection error:', error);
  }
  
  return events;
}

/**
 * 解析EFAS事件
 */
function parseEFASEvent(item: any): EFASEvent | null {
  try {
    // EFAS API响应格式可能包含以下字段：
    // - event_id, eventId, id
    // - country, country_code
    // - region, area, basin
    // - latitude, lat
    // - longitude, lon, lng
    // - valid_from, start_time, time_from
    // - valid_to, end_time, time_to
    // - severity, level, alert_level
    // - flood_type, type
    // - description, text, message
    
    const eventId = item.event_id || item.eventId || item.id || `efas_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const country = item.country || inferCountryFromCode(item.country_code) || 'Unknown';
    const region = item.region || item.area || item.basin;
    const lat = item.latitude || item.lat || (item.coordinates && item.coordinates[1]) || 0;
    const lon = item.longitude || item.lon || item.lng || (item.coordinates && item.coordinates[0]) || 0;
    const timeFrom = item.valid_from || item.start_time || item.time_from || new Date().toISOString();
    const timeTo = item.valid_to || item.end_time || item.time_to || new Date().toISOString();
    const severity = mapEFASSeverity(item.severity || item.alert_level || item.level);
    const level = mapEFASLevel(item.severity || item.alert_level || item.level);
    const floodType = item.flood_type || item.type || 'river';
    const description = item.description || item.text || item.message || '';
    const sourceUrl = item.url || item.link || `https://www.efas.eu/`;
    
    return {
      eventId,
      country,
      region,
      latitude: lat,
      longitude: lon,
      timeFrom,
      timeTo,
      severity,
      level,
      floodType,
      description,
      sourceUrl
    };
  } catch (error) {
    console.error('Error parsing EFAS event:', error);
    return null;
  }
}

/**
 * 从国家代码推断国家名
 */
function inferCountryFromCode(code: string): string | null {
  const countryMap: Record<string, string> = {
    'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia',
    'CY': 'Cyprus', 'CZ': 'Czech Republic', 'DK': 'Denmark', 'EE': 'Estonia',
    'FI': 'Finland', 'FR': 'France', 'DE': 'Germany', 'GR': 'Greece',
    'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia',
    'LT': 'Lithuania', 'LU': 'Luxembourg', 'MT': 'Malta', 'NL': 'Netherlands',
    'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia',
    'SI': 'Slovenia', 'ES': 'Spain', 'SE': 'Sweden'
  };
  
  return countryMap[code?.toUpperCase()] || null;
}

/**
 * 映射EFAS严重程度
 */
function mapEFASSeverity(level: string | number): string {
  if (typeof level === 'number') {
    if (level >= 4) return 'extreme';
    if (level >= 3) return 'high';
    if (level >= 2) return 'medium';
    return 'low';
  }
  
  const lower = String(level).toLowerCase();
  if (lower.includes('extreme') || lower.includes('severe')) return 'extreme';
  if (lower.includes('high') || lower.includes('major')) return 'high';
  if (lower.includes('moderate') || lower.includes('medium')) return 'medium';
  return 'low';
}

/**
 * 映射EFAS级别到数字
 */
function mapEFASLevel(level: string | number): number {
  if (typeof level === 'number') return level;
  
  const lower = String(level).toLowerCase();
  if (lower.includes('extreme') || lower.includes('severe')) return 4;
  if (lower.includes('high') || lower.includes('major')) return 3;
  if (lower.includes('moderate') || lower.includes('medium')) return 2;
  return 1;
}

