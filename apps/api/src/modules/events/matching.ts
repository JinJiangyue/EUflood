// 跨平台事件匹配：判断不同平台的事件是否为同一场降雨

interface CandidateEvent {
  id?: number;
  source: string;
  event_date: string;
  country: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  time_from?: string;
  time_to?: string;
}

/**
 * 判断两个事件是否为同一场降雨
 * 匹配规则：
 * 1. 时间重叠（±12小时）
 * 2. 坐标距离 < 50km（如果有坐标）
 * 3. 国家必须相同
 */
export function isSameEvent(event1: CandidateEvent, event2: CandidateEvent): boolean {
  // 1. 国家匹配（必须）
  if (event1.country !== event2.country) {
    return false;
  }
  
  // 2. 时间重叠检查（±12小时）
  const time1 = new Date(event1.time_from || event1.event_date).getTime();
  const time2 = new Date(event2.time_from || event2.event_date).getTime();
  const timeDiffHours = Math.abs(time1 - time2) / (1000 * 60 * 60);
  
  if (timeDiffHours > 12) {
    return false; // 超过12小时，不是同一事件
  }
  
  // 3. 坐标匹配（如果有坐标，距离 < 50km）
  if (event1.latitude && event1.longitude && event2.latitude && event2.longitude) {
    const distance = calculateDistance(
      event1.latitude, event1.longitude,
      event2.latitude, event2.longitude
    );
    if (distance > 50) {
      return false; // 超过50km，不是同一事件
    }
    // 有坐标且距离 < 50km，认为是同一事件
    return true;
  }
  
  // 4. 如果没有坐标，使用城市匹配（±12小时 + 相同城市）
  if (event1.city && event2.city) {
    const city1 = event1.city.toLowerCase().trim();
    const city2 = event2.city.toLowerCase().trim();
    if (city1 === city2 && timeDiffHours <= 12) {
      return true;
    }
  }
  
  // 5. 只有国家匹配，时间接近，但无坐标/城市，保守判断为不同事件
  return false;
}

/**
 * 计算两点间距离（公里）- Haversine公式
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 地球半径（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 为事件生成全局唯一键（跨平台去重）
 * 基于：日期 + 国家 + 坐标（或城市）+ 时间
 */
export function generateGlobalEventKey(event: CandidateEvent): string {
  const date = event.event_date;
  const country = event.country.toLowerCase().trim();
  const city = event.city?.toLowerCase().trim() || '';
  const time = event.time_from ? event.time_from.substring(0, 13) : event.event_date; // 精确到小时
  
  // 如果有坐标，使用坐标（精确到0.1度，约11km）
  if (event.latitude && event.longitude) {
    const lat = Math.round(event.latitude * 10) / 10;
    const lon = Math.round(event.longitude * 10) / 10;
    return `event_${date}_${country}_${lat}_${lon}_${time}`;
  }
  
  // 否则使用城市
  return `event_${date}_${country}_${city}_${time}`;
}

