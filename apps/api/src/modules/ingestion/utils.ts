import crypto from 'crypto';

// 地理编码模拟（实际应调用 Nominatim/Google Geocoding API）
export function geocodeLocation(country: string, city: string): { lat: number; lon: number } | null {
  const geoMap: Record<string, Record<string, [number, number]>> = {
    Spain: { Madrid: [40.4168, -3.7038], Barcelona: [41.3851, 2.1734], Valencia: [39.4699, -0.3763], Seville: [37.3891, -5.9845] },
    Germany: { Berlin: [52.5200, 13.4050], Hamburg: [53.5511, 9.9937], Munich: [48.1351, 11.5820], Cologne: [50.9375, 6.9603] },
    Italy: { Rome: [41.9028, 12.4964], Milan: [45.4642, 9.1900], Naples: [40.8518, 14.2681], Turin: [45.0703, 7.6869] },
    France: { Paris: [48.8566, 2.3522], Lyon: [45.7640, 4.8357], Marseille: [43.2965, 5.3698], Nice: [43.7102, 7.2620] },
    Denmark: { Copenhagen: [55.6761, 12.5683], Aarhus: [56.1629, 10.2039], Odense: [55.4038, 10.4024], Aalborg: [57.0488, 9.9217] }
  };
  const coords = geoMap[country]?.[city];
  return coords ? { lat: coords[0], lon: coords[1] } : null;
}

// 生成去重ID（基于标准化字段的hash）
export function generateRecordId(data: {
  country?: string;
  specific_location?: string;
  event_time?: string;
  coordinates?: string;
  title?: string;
  description?: string;
  source_url?: string;
}): string {
  const normalized = [
    data.country?.toLowerCase().trim() || '',
    data.specific_location?.toLowerCase().trim() || '',
    data.event_time?.substring(0, 16) || '', // 精确到分钟
    data.coordinates || '',
    (data.title || data.description || '').substring(0, 100).toLowerCase().trim()
  ].join('|');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
  const source = data.source_url ? new URL(data.source_url).hostname.replace(/\./g, '_') : 'unknown';
  return `${source}_${hash}`;
}

// 计算置信度（源头权重 + 字段完整度 + 多源一致度）
export function calculateConfidence(
  sourceType: 'official_api' | 'social_media' | 'news' | 'sensor',
  hasCoordinates: boolean,
  hasWaterLevel: boolean,
  hasEventTime: boolean,
  evidenceCount: number = 1
): number {
  // 源头权重
  const sourceWeights: Record<string, number> = {
    official_api: 0.9,
    sensor: 0.85,
    news: 0.6,
    social_media: 0.4
  };
  const baseConfidence = sourceWeights[sourceType] || 0.5;

  // 字段完整度奖励（每个关键字段+0.05）
  let completeness = baseConfidence;
  if (hasCoordinates) completeness += 0.05;
  if (hasWaterLevel) completeness += 0.05;
  if (hasEventTime) completeness += 0.05;

  // 多源一致度奖励（每多一个证据源+0.1，上限0.95）
  const multiSourceBonus = Math.min(0.15, (evidenceCount - 1) * 0.1);
  const final = Math.min(0.95, completeness + multiSourceBonus);

  return Math.round(final * 100) / 100;
}

// 根据水位推断严重程度
export function inferSeverity(waterLevel: number | null, description?: string): string {
  if (waterLevel !== null) {
    if (waterLevel >= 4.5) return 'extreme';
    if (waterLevel >= 3.0) return 'high';
    if (waterLevel >= 1.5) return 'medium';
    return 'low';
  }
  // 从描述推断
  const desc = (description || '').toLowerCase();
  if (desc.includes('extreme') || desc.includes('严重') || desc.includes('critical')) return 'extreme';
  if (desc.includes('high') || desc.includes('高') || desc.includes('major')) return 'high';
  if (desc.includes('medium') || desc.includes('中') || desc.includes('moderate')) return 'medium';
  return 'low';
}

