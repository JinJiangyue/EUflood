// 触发器配置
export const TRIGGER_CONFIG = {
  // Open-Meteo API 配置
  openMeteo: {
    baseUrl: 'https://api.open-meteo.com/v1/forecast',
    // 欧洲主要城市坐标（可作为监控点）
    monitoringPoints: [
      { name: 'Madrid', lat: 40.4168, lon: -3.7038, country: 'Spain' },
      { name: 'Barcelona', lat: 41.3851, lon: 2.1734, country: 'Spain' },
      { name: 'Berlin', lat: 52.5200, lon: 13.4050, country: 'Germany' },
      { name: 'Munich', lat: 48.1351, lon: 11.5820, country: 'Germany' },
      { name: 'Rome', lat: 41.9028, lon: 12.4964, country: 'Italy' },
      { name: 'Milan', lat: 45.4642, lon: 9.1900, country: 'Italy' },
      { name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'France' },
      { name: 'Lyon', lat: 45.7640, lon: 4.8357, country: 'France' },
      { name: 'Copenhagen', lat: 55.6761, lon: 12.5683, country: 'Denmark' },
      { name: 'Prague', lat: 50.0755, lon: 14.4378, country: 'Czech Republic' },
      { name: 'Warsaw', lat: 52.2297, lon: 21.0122, country: 'Poland' },
      { name: 'Vienna', lat: 48.2082, lon: 16.3738, country: 'Austria' },
      { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, country: 'Netherlands' },
      { name: 'Brussels', lat: 50.8503, lon: 4.3517, country: 'Belgium' },
      { name: 'Stockholm', lat: 59.3293, lon: 18.0686, country: 'Sweden' },
      { name: 'Helsinki', lat: 60.1699, lon: 24.9384, country: 'Finland' },
    ],
    // 触发阈值
    thresholds: {
      precipitation: 5.0, // mm/h，超过此值触发
      precipitation24h: 20.0, // mm/24h，24小时累计
    },
    // 检查频率（分钟）
    checkInterval: 10,
  },
  
  // 国家映射配置
  countryMapping: {
    // 国家代码 → 数据源模块映射
    'Spain': 'aemet',
    'Germany': 'dwd', // 德国气象服务
    'Italy': 'ansa', // 先用RSS，后续可接入官方API
    'France': 'france24', // 先用RSS，后续可接入Météo-France
    'Denmark': 'dmi',
    'Czech Republic': 'chmi',
    'Poland': 'imgw', // 波兰气象水文研究所
    'Austria': 'geosphere',
    'Netherlands': 'knmi', // 荷兰皇家气象研究所
    'Belgium': 'rmi',
    'Sweden': 'smhi',
    'Finland': 'fmi',
    'Estonia': 'emhi',
    'Portugal': 'ipma',
    'Romania': 'rmi',
    'Slovakia': 'shmu',
    'Slovenia': 'arso',
    'Latvia': 'lvgmc',
    'Hungary': 'omsz', // 匈牙利气象局
    'Greece': 'hnms', // 希腊国家气象局
    'Cyprus': 'cyprus',
    'Malta': 'malta',
  }
};

// 根据坐标推断国家（简化版，实际可用地理编码API）
export function getCountryFromCoordinates(lat: number, lon: number): string | null {
  // 这里可以用地理编码API（如Nominatim）或国家边界数据
  // 简化版：根据已知监控点匹配
  for (const point of TRIGGER_CONFIG.openMeteo.monitoringPoints) {
    const distance = Math.sqrt(
      Math.pow(lat - point.lat, 2) + Math.pow(lon - point.lon, 2)
    );
    if (distance < 0.5) { // 约50km范围内
      return point.country;
    }
  }
  return null;
}

