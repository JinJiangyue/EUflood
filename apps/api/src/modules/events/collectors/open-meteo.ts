// Open-Meteo 历史降雨数据采集器
// Open-Meteo 提供免费的历史降雨数据查询，无需API Key

export interface OpenMeteoEvent {
  latitude: number;
  longitude: number;
  country: string;
  city?: string;
  time: string;
  precipitation: number; // mm/h
  precipitation24h?: number; // mm/24h
  severity: string;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    precipitation: number[];
  };
  daily?: {
    time: string[];
    precipitation_sum: number[];
  };
}

/**
 * 查询指定日期范围的历史降雨数据
 * @param dateFrom 开始日期 (YYYY-MM-DD)
 * @param dateTo 结束日期 (YYYY-MM-DD)
 * @param bbox 边界框 {north, south, east, west}
 * @param threshold 降雨阈值 (mm/h)，超过此值才记录
 * @returns 降雨事件列表
 */
export async function collectOpenMeteoEvents(
  dateFrom: string,
  dateTo: string,
  bbox: { north: number; south: number; east: number; west: number },
  threshold: number = 5.0
): Promise<OpenMeteoEvent[]> {
  const events: OpenMeteoEvent[] = [];
  
  // 网格扫描（简化版：按0.5度间隔扫描，约55km）
  // 实际应用中可以优化为更密集的网格或使用地理编码API获取城市坐标
  const latStep = 0.5;
  const lonStep = 0.5;
  
  // 计算网格点数量
  const latCount = Math.ceil((bbox.north - bbox.south) / latStep);
  const lonCount = Math.ceil((bbox.east - bbox.west) / lonStep);
  
  console.log(`Scanning ${latCount * lonCount} grid points for rainfall events...`);
  
  // 遍历网格点
  for (let lat = bbox.south; lat <= bbox.north; lat += latStep) {
    for (let lon = bbox.west; lon <= bbox.east; lon += lonStep) {
      try {
        // 查询该点的历史降雨数据
        const url = `https://api.open-meteo.com/v1/forecast?` +
          `latitude=${lat}&longitude=${lon}&` +
          `hourly=precipitation&` +
          `daily=precipitation_sum&` +
          `start_date=${dateFrom}&end_date=${dateTo}&` +
          `timezone=auto`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'FloodMonitor/1.0'
          }
        });
        
        if (!response.ok) {
          console.warn(`Open-Meteo API error for (${lat}, ${lon}): ${response.status}`);
          continue;
        }
        
        const data: OpenMeteoResponse = await response.json();
        
        // 处理每小时数据
        if (data.hourly && data.hourly.time && data.hourly.precipitation) {
          for (let i = 0; i < data.hourly.time.length; i++) {
            const precip = data.hourly.precipitation[i] || 0;
            if (precip >= threshold) {
              const time = data.hourly.time[i];
              
              // 计算24小时累计（如果有daily数据）
              let precipitation24h: number | undefined;
              if (data.daily && data.daily.time && data.daily.precipitation_sum) {
                const date = time.substring(0, 10);
                const dailyIndex = data.daily.time.findIndex(d => d.startsWith(date));
                if (dailyIndex >= 0) {
                  precipitation24h = data.daily.precipitation_sum[dailyIndex];
                }
              }
              
              // 推断国家（简化版，实际应使用地理编码API）
              const country = await inferCountryFromCoordinates(lat, lon);
              
              events.push({
                latitude: lat,
                longitude: lon,
                country: country || 'Unknown',
                time,
                precipitation: precip,
                precipitation24h,
                severity: inferSeverityFromPrecipitation(precip, precipitation24h)
              });
            }
          }
        }
        
        // 避免请求过快（Open-Meteo限制：每分钟600次）
        await sleep(100); // 100ms延迟，约每分钟600次
        
      } catch (error) {
        console.error(`Error querying Open-Meteo for (${lat}, ${lon}):`, error);
      }
    }
  }
  
  return events;
}

/**
 * 根据坐标推断国家（使用Nominatim反向地理编码）
 */
async function inferCountryFromCoordinates(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FloodMonitor/1.0'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.address) return null;
    
    const country = data.address.country || data.address.country_code;
    
    // 标准化国家名
    const countryNameMap: Record<string, string> = {
      'ES': 'Spain', 'FR': 'France', 'IT': 'Italy', 'CZ': 'Czech Republic',
      'SE': 'Sweden', 'FI': 'Finland', 'DE': 'Germany', 'PL': 'Poland',
      'NL': 'Netherlands', 'BE': 'Belgium', 'AT': 'Austria', 'DK': 'Denmark',
      'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia', 'SI': 'Slovenia',
      'LV': 'Latvia', 'EE': 'Estonia', 'HU': 'Hungary', 'GR': 'Greece',
      'CY': 'Cyprus', 'MT': 'Malta', 'IE': 'Ireland', 'LU': 'Luxembourg'
    };
    
    return countryNameMap[country] || country;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * 根据降雨量推断严重程度
 */
function inferSeverityFromPrecipitation(currentPrecip: number, dailyPrecip?: number): string {
  if (currentPrecip >= 20) return 'extreme';
  if (currentPrecip >= 10) return 'high';
  if (currentPrecip >= 5) return 'medium';
  if (dailyPrecip && dailyPrecip >= 50) return 'high';
  if (dailyPrecip && dailyPrecip >= 25) return 'medium';
  return 'low';
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

