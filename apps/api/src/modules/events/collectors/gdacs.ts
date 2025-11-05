// GDACS (Global Disaster Alert and Coordination System) 数据采集器
// GDACS 提供全球灾害事件，包括洪水

export interface GDACSEvent {
  eventId: string;
  eventType: string; // flood, earthquake, etc.
  country: string;
  location: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate?: string;
  severity: string;
  alertLevel: string; // Green, Orange, Red
  description: string;
  sourceUrl: string;
}

/**
 * GDACS RSS 采集器
 * 
 * 注意：GDACS RSS 不支持按日期查询，必须下载整个RSS然后本地筛选
 * 优化方案：
 * 1. 可以缓存RSS到本地数据库，定期更新
 * 2. 查询时从缓存读取，按日期筛选
 * 
 * @param date 查询日期（YYYY-MM-DD），但GDACS RSS不支持按日期过滤，会返回所有事件
 * @returns 筛选后的GDACS事件列表
 */
export async function collectGDACSEvents(date: string): Promise<GDACSEvent[]> {
  try {
    // GDACS RSS feed（洪水事件）
    // ⚠️ 注意：这个RSS不支持URL参数按日期查询，必须下载全部RSS
    // URL格式：https://www.gdacs.org/xml/rss.xml（无参数）
    const rssUrl = 'https://www.gdacs.org/xml/rss.xml';
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FloodMonitor/1.0)'
      }
    });
    if (!response.ok) {
      console.warn(`GDACS RSS fetch failed: ${response.status}`);
      return [];
    }
    
    const text = await response.text();
    const events: GDACSEvent[] = [];
    
    // 解析RSS XML（简化版，实际应用应使用XML解析库如fast-xml-parser）
    // 移除CDATA标记
    const cleanText = text.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    const itemMatches = cleanText.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      const item = match[1];
      const titleMatch = item.match(/<title>(.*?)<\/title>/i);
      const linkMatch = item.match(/<link>(.*?)<\/link>/i);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);
      const descriptionMatch = item.match(/<description>(.*?)<\/description>/i);
      
      if (!titleMatch || !linkMatch) continue;
      
      const title = titleMatch[1].trim();
      let pubDate = '';
      try {
        if (pubDateMatch) {
          pubDate = new Date(pubDateMatch[1].trim()).toISOString().substring(0, 10);
        }
      } catch (e) {
        // 日期解析失败，跳过
        continue;
      }
      
      // ⚠️ 本地筛选：只处理指定日期的事件（或最近3天内的，因为GDACS可能延迟发布）
      // 这是效率低的原因：必须下载全部RSS，然后本地筛选
      const daysDiff = Math.abs((new Date(date).getTime() - new Date(pubDate || date).getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 3) continue;
      
      // 只处理洪水相关事件（关键词匹配）
      const lowerTitle = title.toLowerCase();
      const lowerDesc = (descriptionMatch ? descriptionMatch[1] : '').toLowerCase();
      if (!lowerTitle.includes('flood') && !lowerTitle.includes('洪水') && 
          !lowerTitle.includes('inundation') && !lowerTitle.includes('inondation') &&
          !lowerDesc.includes('flood') && !lowerDesc.includes('洪水')) continue;
      
      // 从标题和描述提取国家（改进版）
      const fullText = title + ' ' + (descriptionMatch ? descriptionMatch[1] : '');
      let country = extractCountryFromTitle(fullText);
      let location = extractLocationFromTitle(title);
      
      // 尝试从描述中提取坐标（如果有）
      let lat = 0, lon = 0;
      if (descriptionMatch) {
        const desc = descriptionMatch[1];
        // 尝试多种坐标格式
        const coordPatterns = [
          /(\d+\.?\d*)\s*[°NSEW,]\s*(\d+\.?\d*)/,
          /lat[itude]*[:\s]*(-?\d+\.?\d*)[,\s]+lon[gitude]*[:\s]*(-?\d+\.?\d*)/i,
          /(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/, // 简单格式 lat,lon
        ];
        for (const pattern of coordPatterns) {
          const coordMatch = desc.match(pattern);
          if (coordMatch) {
            lat = parseFloat(coordMatch[1]);
            lon = parseFloat(coordMatch[2]);
            if (lat && lon && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
              break;
            }
          }
        }
        
        // 如果有坐标但国家未知，尝试从GDACS链接中提取
        if ((!country || country === 'Unknown') && lat && lon) {
          try {
            const geoInfo = await reverseGeocode(lat, lon);
            if (geoInfo) {
              country = geoInfo.country || country;
              location = geoInfo.city || location || geoInfo.region || 'Unknown';
            }
          } catch (e) {
            // 地理编码失败，继续使用原有逻辑
          }
        }
      }
      
      // 如果还是Unknown，尝试从GDACS链接中提取（链接可能包含国家代码）
      if ((!country || country === 'Unknown') && linkMatch) {
        const url = linkMatch[1].trim();
        const countryFromUrl = extractCountryFromUrl(url);
        if (countryFromUrl) {
          country = countryFromUrl;
        }
      }
      
      events.push({
        eventId: `gdacs_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        eventType: 'flood',
        country: country || 'Unknown',
        location: location || 'Unknown',
        latitude: lat,
        longitude: lon,
        startDate: pubDate || date,
        endDate: undefined,
        severity: inferSeverityFromTitle(fullText),
        alertLevel: inferSeverityFromTitle(title) === 'high' ? 'Red' : 'Orange',
        description: descriptionMatch ? descriptionMatch[1].trim() : title,
        sourceUrl: linkMatch[1].trim()
      });
    }
    
    return events;
  } catch (error) {
    console.error('GDACS collection error:', error);
    return [];
  }
}

function extractCountryFromTitle(title: string): string | null {
  // 简化的国家提取（实际应使用更精确的方法或NLP）
  const countryMap: Record<string, string> = {
    'spain': 'Spain', 'españa': 'Spain', 'españ': 'Spain',
    'france': 'France', 'français': 'France',
    'italy': 'Italy', 'italia': 'Italy', 'italiano': 'Italy',
    'czech': 'Czech Republic', 'czech republic': 'Czech Republic', 'česká': 'Czech Republic',
    'sweden': 'Sweden', 'sverige': 'Sweden', 'svensk': 'Sweden',
    'finland': 'Finland', 'suomi': 'Finland', 'finnish': 'Finland',
    'germany': 'Germany', 'deutschland': 'Germany', 'german': 'Germany',
    'poland': 'Poland', 'polska': 'Poland',
    'netherlands': 'Netherlands', 'nederland': 'Netherlands', 'dutch': 'Netherlands',
    'belgium': 'Belgium', 'belgique': 'Belgium', 'belgië': 'Belgium',
    'austria': 'Austria', 'österreich': 'Austria',
    'denmark': 'Denmark', 'danmark': 'Denmark', 'danish': 'Denmark'
  };
  
  const lower = title.toLowerCase();
  // 按长度排序，优先匹配较长的关键词
  const sortedKeys = Object.keys(countryMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return countryMap[key];
  }
  return null;
}

function extractLocationFromTitle(title: string): string | null {
  // 简化版：提取可能的城市名（常见欧洲城市）
  const commonCities = [
    'Madrid', 'Barcelona', 'Paris', 'Lyon', 'Rome', 'Milan', 'Berlin', 'Munich',
    'Prague', 'Warsaw', 'Vienna', 'Amsterdam', 'Brussels', 'Stockholm', 'Helsinki',
    'Copenhagen', 'Oslo', 'Lisbon', 'Porto', 'Budapest', 'Bucharest', 'Sofia'
  ];
  const lower = title.toLowerCase();
  for (const city of commonCities) {
    if (lower.includes(city.toLowerCase())) {
      return city;
    }
  }
  return null;
}

// 从URL提取国家（GDACS链接可能包含国家代码）
function extractCountryFromUrl(url: string): string | null {
  // GDACS URL格式可能是：https://www.gdacs.org/alerts/event.aspx?eventid=...&country=...
  const countryMatch = url.match(/country[=:]([A-Z]{2})/i);
  if (countryMatch) {
    const countryCode = countryMatch[1].toUpperCase();
    const countryCodeMap: Record<string, string> = {
      'ES': 'Spain', 'FR': 'France', 'IT': 'Italy', 'CZ': 'Czech Republic',
      'SE': 'Sweden', 'FI': 'Finland', 'DE': 'Germany', 'PL': 'Poland',
      'NL': 'Netherlands', 'BE': 'Belgium', 'AT': 'Austria', 'DK': 'Denmark'
    };
    return countryCodeMap[countryCode] || null;
  }
  return null;
}

// 反向地理编码（根据坐标获取国家/城市）
async function reverseGeocode(lat: number, lon: number): Promise<{ country?: string; city?: string; region?: string } | null> {
  try {
    // 使用Nominatim（OpenStreetMap的免费地理编码服务）
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FloodMonitor/1.0'
      }
    });
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.address) return null;
    
    const address = data.address;
    const country = address.country || address.country_code?.toUpperCase();
    const city = address.city || address.town || address.village || address.municipality;
    const region = address.state || address.region;
    
    // 标准化国家名
    const countryNameMap: Record<string, string> = {
      'ES': 'Spain', 'FR': 'France', 'IT': 'Italy', 'CZ': 'Czech Republic',
      'SE': 'Sweden', 'FI': 'Finland', 'DE': 'Germany', 'PL': 'Poland',
      'NL': 'Netherlands', 'BE': 'Belgium', 'AT': 'Austria', 'DK': 'Denmark',
      'United Kingdom': 'UK', 'United States': 'USA'
    };
    
    const normalizedCountry = countryNameMap[country] || country;
    
    return {
      country: normalizedCountry,
      city: city || undefined,
      region: region || undefined
    };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

function inferSeverityFromTitle(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('severe') || lower.includes('major') || lower.includes('extreme')) return 'high';
  if (lower.includes('moderate') || lower.includes('medium')) return 'medium';
  return 'low';
}

