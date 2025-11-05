// Meteoalarm 数据采集器
// Meteoalarm 是欧盟统一的气象预警平台，提供已发布的预警信息
// 需要API Key（Bearer Token），联系 meteoalarm@geosphere.at 获取

export interface MeteoalarmEvent {
  country: string;
  countryCode: string;
  region: string;
  severity: string;
  level: number;
  eventType: string;
  timeFrom: string;
  timeTo: string;
  coordinates?: { lat: number; lon: number };
  description?: string;
  sourceUrl?: string;
}

/**
 * 采集Meteoalarm预警事件（按日期范围）
 * @param dateFrom 开始日期 (YYYY-MM-DD)
 * @param dateTo 结束日期 (YYYY-MM-DD)
 * @returns 预警事件列表
 */
export async function collectMeteoalarmEvents(dateFrom: string, dateTo: string): Promise<MeteoalarmEvent[]> {
  const events: MeteoalarmEvent[] = [];
  const apiKey = process.env.METEOALARM_API_KEY;
  
  if (!apiKey) {
    console.warn('Meteoalarm API Key not configured. Skipping Meteoalarm collection.');
    console.warn('To enable Meteoalarm, set METEOALARM_API_KEY in .env file.');
    console.warn('Contact meteoalarm@geosphere.at to get API access.');
    return events;
  }
  
  // 欧盟国家代码列表
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  
  try {
    // 方法1：使用Meteoalarm API（如果可用）
    // API端点可能需要根据实际文档调整
    const baseUrl = 'https://api.meteoalarm.org/edr/v1';
    
    for (const countryCode of euCountries) {
      try {
        // 尝试API端点（需要根据实际API文档调整）
        // 示例：GET /warnings/{countryCode}?date_from={dateFrom}&date_to={dateTo}
        const url = `${baseUrl}/warnings/${countryCode}?date_from=${dateFrom}&date_to=${dateTo}`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'FloodMonitor/1.0'
          }
        });
        
        if (response.status === 401) {
          console.warn(`Meteoalarm API authentication failed for ${countryCode}. Check API key.`);
          continue;
        }
        
        if (response.status === 404) {
          // API端点不存在，尝试RSS方式
          const rssEvents = await collectMeteoalarmFromRSS(countryCode, dateFrom, dateTo);
          events.push(...rssEvents);
          continue;
        }
        
        if (!response.ok) {
          console.warn(`Meteoalarm API error for ${countryCode}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        // 解析API响应（格式需要根据实际API调整）
        if (Array.isArray(data)) {
          for (const item of data) {
            // 只处理降雨/洪水相关预警
            if (isRainfallOrFloodEvent(item)) {
              events.push(parseMeteoalarmEvent(item, countryCode));
            }
          }
        }
        
      } catch (error) {
        console.error(`Meteoalarm collection error for ${countryCode}:`, error);
        // 如果API失败，尝试RSS方式
        try {
          const rssEvents = await collectMeteoalarmFromRSS(countryCode, dateFrom, dateTo);
          events.push(...rssEvents);
        } catch (rssError) {
          console.error(`Meteoalarm RSS collection error for ${countryCode}:`, rssError);
        }
      }
    }
    
  } catch (error) {
    console.error('Meteoalarm collection error:', error);
  }
  
  return events;
}

/**
 * 从RSS采集Meteoalarm数据（备用方案）
 */
async function collectMeteoalarmFromRSS(countryCode: string, dateFrom: string, dateTo: string): Promise<MeteoalarmEvent[]> {
  const events: MeteoalarmEvent[] = [];
  
  try {
    // Meteoalarm RSS URL格式：https://www.meteoalarm.eu/rss/{countryCode}.xml
    const rssUrl = `https://www.meteoalarm.eu/rss/${countryCode}.xml`;
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'FloodMonitor/1.0'
      }
    });
    
    if (!response.ok) {
      return events;
    }
    
    const text = await response.text();
    
    // 解析RSS XML（简化版）
    const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      const item = match[1];
      const titleMatch = item.match(/<title>(.*?)<\/title>/i);
      const linkMatch = item.match(/<link>(.*?)<\/link>/i);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);
      const descriptionMatch = item.match(/<description>(.*?)<\/description>/i);
      
      if (!titleMatch) continue;
      
      // 检查日期是否在范围内
      if (pubDateMatch) {
        const pubDate = new Date(pubDateMatch[1].trim()).toISOString().substring(0, 10);
        if (pubDate < dateFrom || pubDate > dateTo) continue;
      }
      
      // 只处理降雨/洪水相关预警
      const title = titleMatch[1].trim();
      if (!isRainfallOrFloodTitle(title)) continue;
      
      // 解析事件信息
      const event = parseMeteoalarmRSSItem(item, countryCode, title, linkMatch?.[1]?.trim());
      if (event) {
        events.push(event);
      }
    }
    
  } catch (error) {
    console.error(`Meteoalarm RSS parsing error for ${countryCode}:`, error);
  }
  
  return events;
}

/**
 * 判断是否为降雨/洪水事件
 */
function isRainfallOrFloodEvent(item: any): boolean {
  const title = (item.title || '').toLowerCase();
  const description = (item.description || '').toLowerCase();
  const eventType = (item.eventType || '').toLowerCase();
  
  return title.includes('rain') || title.includes('flood') || title.includes('precipitation') ||
         description.includes('rain') || description.includes('flood') ||
         eventType === 'rain' || eventType === 'flood' || eventType === 'precipitation';
}

/**
 * 判断标题是否为降雨/洪水相关
 */
function isRainfallOrFloodTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes('rain') || lower.includes('flood') || lower.includes('precipitation') ||
         lower.includes('pluie') || lower.includes('inondation') || lower.includes('lluvia') ||
         lower.includes('inundación');
}

/**
 * 解析Meteoalarm API事件
 */
function parseMeteoalarmEvent(item: any, countryCode: string): MeteoalarmEvent {
  const countryNameMap: Record<string, string> = {
    'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia',
    'CY': 'Cyprus', 'CZ': 'Czech Republic', 'DK': 'Denmark', 'EE': 'Estonia',
    'FI': 'Finland', 'FR': 'France', 'DE': 'Germany', 'GR': 'Greece',
    'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia',
    'LT': 'Lithuania', 'LU': 'Luxembourg', 'MT': 'Malta', 'NL': 'Netherlands',
    'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia',
    'SI': 'Slovenia', 'ES': 'Spain', 'SE': 'Sweden'
  };
  
  return {
    country: countryNameMap[countryCode] || countryCode,
    countryCode,
    region: item.region || item.area || 'Unknown',
    severity: mapSeverityLevel(item.severity || item.level),
    level: mapLevelToNumber(item.severity || item.level),
    eventType: item.eventType || 'rain',
    timeFrom: item.validFrom || item.startTime || new Date().toISOString(),
    timeTo: item.validTo || item.endTime || new Date().toISOString(),
    coordinates: item.coordinates || (item.lat && item.lon ? { lat: item.lat, lon: item.lon } : undefined),
    description: item.description || item.text || '',
    sourceUrl: item.url || item.link || `https://www.meteoalarm.eu/en_UK/${countryCode}.html`
  };
}

/**
 * 解析Meteoalarm RSS项
 */
function parseMeteoalarmRSSItem(item: string, countryCode: string, title: string, link?: string): MeteoalarmEvent | null {
  const countryNameMap: Record<string, string> = {
    'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'HR': 'Croatia',
    'CY': 'Cyprus', 'CZ': 'Czech Republic', 'DK': 'Denmark', 'EE': 'Estonia',
    'FI': 'Finland', 'FR': 'France', 'DE': 'Germany', 'GR': 'Greece',
    'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia',
    'LT': 'Lithuania', 'LU': 'Luxembourg', 'MT': 'Malta', 'NL': 'Netherlands',
    'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia',
    'SI': 'Slovenia', 'ES': 'Spain', 'SE': 'Sweden'
  };
  
  // 从标题提取区域和严重程度
  const regionMatch = title.match(/\s+-\s+([^-]+)$/);
  const region = regionMatch ? regionMatch[1].trim() : 'Unknown';
  
  // 推断严重程度
  let severity = 'low';
  let level = 1;
  if (title.includes('Red') || title.includes('extreme')) {
    severity = 'extreme';
    level = 4;
  } else if (title.includes('Orange') || title.includes('high')) {
    severity = 'high';
    level = 3;
  } else if (title.includes('Yellow') || title.includes('moderate')) {
    severity = 'medium';
    level = 2;
  }
  
  return {
    country: countryNameMap[countryCode] || countryCode,
    countryCode,
    region,
    severity,
    level,
    eventType: 'rain',
    timeFrom: new Date().toISOString(),
    timeTo: new Date().toISOString(),
    description: title,
    sourceUrl: link || `https://www.meteoalarm.eu/en_UK/${countryCode}.html`
  };
}

/**
 * 映射严重程度
 */
function mapSeverityLevel(level: string | number): string {
  if (typeof level === 'number') {
    if (level >= 4) return 'extreme';
    if (level >= 3) return 'high';
    if (level >= 2) return 'medium';
    return 'low';
  }
  
  const lower = String(level).toLowerCase();
  if (lower.includes('red') || lower.includes('extreme')) return 'extreme';
  if (lower.includes('orange') || lower.includes('high')) return 'high';
  if (lower.includes('yellow') || lower.includes('moderate')) return 'medium';
  return 'low';
}

/**
 * 映射级别到数字
 */
function mapLevelToNumber(level: string | number): number {
  if (typeof level === 'number') return level;
  
  const lower = String(level).toLowerCase();
  if (lower.includes('red') || lower.includes('extreme')) return 4;
  if (lower.includes('orange') || lower.includes('high')) return 3;
  if (lower.includes('yellow') || lower.includes('moderate')) return 2;
  return 1;
}

