// 事件整理模块：根据候选事件，调用对应国家的数据源进行多源采集和入库

import { db } from '../../db';
import { generateRecordId, calculateConfidence } from '../ingestion/utils';

// 国家数据源映射
const COUNTRY_SOURCES: Record<string, string[]> = {
  'Czech Republic': ['chmi'],
  'Sweden': ['smhi'],
  'Finland': ['fmi'],
  'France': ['france24'],
  'Italy': ['ansa'],
  'Spain': ['aemet'], // 需要API Key
};

// 整理事件：调用对应国家的数据源
export async function enrichEvent(candidateId: number): Promise<{ recordsCreated: number }> {
  const candidate = db.prepare('SELECT * FROM event_candidates WHERE id = ?').get(candidateId) as any;
  if (!candidate) {
    throw new Error('Candidate event not found');
  }
  
  const country = candidate.country;
  const sources = COUNTRY_SOURCES[country] || [];
  let totalRecords = 0;
  
  // 调用对应国家的数据源
  for (const source of sources) {
    try {
      let records = 0;
      switch (source) {
        case 'chmi':
          records = await collectCHMI(candidate);
          break;
        case 'smhi':
          records = await collectSMHI(candidate);
          break;
        case 'fmi':
          records = await collectFMI(candidate);
          break;
        case 'france24':
          records = await collectFrance24(candidate);
          break;
        case 'ansa':
          records = await collectANSA(candidate);
          break;
        case 'aemet':
          // 需要API Key，暂时跳过
          break;
      }
      totalRecords += records;
    } catch (error) {
      console.error(`Error collecting from ${source} for ${country}:`, error);
    }
  }
  
  // 标记为已整理
  db.prepare('UPDATE event_candidates SET enriched = 1, enriched_at = datetime("now") WHERE id = ?').run(candidateId);
  
  return { recordsCreated: totalRecords };
}

// CHMI (捷克) 采集
async function collectCHMI(candidate: any): Promise<number> {
  // TODO: 实现CHMI CSV数据采集
  // CHMI开放数据：https://opendata.chmi.cz/
  // 需要根据候选事件的时间、地点查询相关数据
  console.log(`Collecting CHMI data for ${candidate.country} on ${candidate.event_date}`);
  return 0; // 临时返回0，待实现
}

// SMHI (瑞典) 采集
async function collectSMHI(candidate: any): Promise<number> {
  // TODO: 实现SMHI Open Data API采集
  // SMHI API：https://opendata.smhi.se/
  console.log(`Collecting SMHI data for ${candidate.country} on ${candidate.event_date}`);
  return 0;
}

// FMI (芬兰) 采集
async function collectFMI(candidate: any): Promise<number> {
  // TODO: 实现FMI WFS/WMS采集
  // FMI WFS：http://opendata.fmi.fi/wfs
  console.log(`Collecting FMI data for ${candidate.country} on ${candidate.event_date}`);
  return 0;
}

// France24 RSS 采集
async function collectFrance24(candidate: any): Promise<number> {
  try {
    const rssUrl = 'https://www.france24.com/en/rss';
    const response = await fetch(rssUrl);
    if (!response.ok) return 0;
    
    const text = await response.text();
    const records: any[] = [];
    
    // 解析RSS（简化版）
    const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const item = match[1];
      const titleMatch = item.match(/<title>(.*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const descriptionMatch = item.match(/<description>(.*?)<\/description>/);
      
      if (!titleMatch || !linkMatch) continue;
      
      const title = titleMatch[1].trim();
      const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toISOString().substring(0, 10) : '';
      
      // 只处理指定日期的事件
      if (pubDate !== candidate.event_date) continue;
      
      // 检查是否与洪水/暴雨相关
      const lowerTitle = title.toLowerCase();
      const lowerDesc = (descriptionMatch ? descriptionMatch[1] : '').toLowerCase();
      if (!lowerTitle.includes('flood') && !lowerTitle.includes('rain') && 
          !lowerDesc.includes('flood') && !lowerDesc.includes('rain')) continue;
      
      // 保存到数据库
      const recordId = generateRecordId({
        country: candidate.country,
        specific_location: candidate.city || '',
        event_time: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : candidate.event_date,
        title,
        source_url: linkMatch[1].trim()
      });
      
      const insert = db.prepare(`
        INSERT INTO flood_records (
          record_id, title, description, water_level, country, specific_location, event_time,
          coordinates, severity, type, status,
          source_type, source_name, source_url, language_code, confidence, evidence_count, metadata, collected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, 1, ?, datetime('now'))
        ON CONFLICT(record_id) DO UPDATE SET evidence_count = evidence_count + 1
      `);
      
      const description = descriptionMatch ? descriptionMatch[1].trim() : title;
      const severity = candidate.severity || 'medium';
      const confidence = calculateConfidence('news', false, false, true, 1);
      
      insert.run(
        recordId, title, description, null, candidate.country, candidate.city || '',
        pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : candidate.event_date,
        candidate.latitude && candidate.longitude ? JSON.stringify({ type: 'Point', coordinates: [candidate.longitude, candidate.latitude] }) : null,
        severity, 'news', 'news', 'France24', linkMatch[1].trim(), 'en', confidence,
        JSON.stringify({ source: 'france24', candidate_id: candidate.id })
      );
      
      records.push({ recordId });
    }
    
    return records.length;
  } catch (error) {
    console.error('France24 collection error:', error);
    return 0;
  }
}

// ANSA RSS 采集
async function collectANSA(candidate: any): Promise<number> {
  try {
    // ANSA有多个RSS feeds，这里使用主要的洪水相关feed
    const rssUrls = [
      'https://www.ansa.it/sito/notizie/cronaca/cronaca.shtml',
      // 可以添加更多ANSA feeds
    ];
    
    let totalRecords = 0;
    for (const rssUrl of rssUrls) {
      try {
        const response = await fetch(rssUrl);
        if (!response.ok) continue;
        
        const text = await response.text();
        
        // 解析RSS（简化版）
        const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);
        for (const match of itemMatches) {
          const item = match[1];
          const titleMatch = item.match(/<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          const descriptionMatch = item.match(/<description>(.*?)<\/description>/);
          
          if (!titleMatch || !linkMatch) continue;
          
          const title = titleMatch[1].trim();
          const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toISOString().substring(0, 10) : '';
          
          // 只处理指定日期的事件
          if (pubDate !== candidate.event_date) continue;
          
          // 检查是否与洪水/暴雨相关（意大利语关键词）
          const lowerTitle = title.toLowerCase();
          const lowerDesc = (descriptionMatch ? descriptionMatch[1] : '').toLowerCase();
          if (!lowerTitle.includes('alluvione') && !lowerTitle.includes('alluvione') && 
              !lowerTitle.includes('pioggia') && !lowerTitle.includes('inondazione') &&
              !lowerDesc.includes('alluvione') && !lowerDesc.includes('pioggia') && !lowerDesc.includes('inondazione')) continue;
          
          // 保存到数据库
          const recordId = generateRecordId({
            country: candidate.country,
            specific_location: candidate.city || '',
            event_time: pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : candidate.event_date,
            title,
            source_url: linkMatch[1].trim()
          });
          
          const insert = db.prepare(`
            INSERT INTO flood_records (
              record_id, title, description, water_level, country, specific_location, event_time,
              coordinates, severity, type, status,
              source_type, source_name, source_url, language_code, confidence, evidence_count, metadata, collected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, 1, ?, datetime('now'))
            ON CONFLICT(record_id) DO UPDATE SET evidence_count = evidence_count + 1
          `);
          
          const description = descriptionMatch ? descriptionMatch[1].trim() : title;
          const severity = candidate.severity || 'medium';
          const confidence = calculateConfidence('news', false, false, true, 1);
          
          insert.run(
            recordId, title, description, null, candidate.country, candidate.city || '',
            pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : candidate.event_date,
            candidate.latitude && candidate.longitude ? JSON.stringify({ type: 'Point', coordinates: [candidate.longitude, candidate.latitude] }) : null,
            severity, 'news', 'news', 'ANSA', linkMatch[1].trim(), 'it', confidence,
            JSON.stringify({ source: 'ansa', candidate_id: candidate.id })
          );
          
          totalRecords++;
        }
      } catch (error) {
        console.error(`Error fetching ANSA RSS from ${rssUrl}:`, error);
      }
    }
    
    return totalRecords;
  } catch (error) {
    console.error('ANSA collection error:', error);
    return 0;
  }
}

