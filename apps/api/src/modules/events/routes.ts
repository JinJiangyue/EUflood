import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { getCandidatesFromDB, getCandidatesFromDBRange, collectAndSaveCandidatesRange } from './service';

export function registerEventsModule(app: Express) {
  // 查询候选事件（支持日期范围）
  app.get('/events/candidates', async (req: Request, res: Response) => {
    // 支持单个日期或日期范围
    const date = req.query.date as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;
    const refresh = req.query.refresh === 'true';
    
    let queryDateFrom: string;
    let queryDateTo: string;
    
    if (date) {
      // 单个日期模式（向后兼容）
      queryDateFrom = date;
      queryDateTo = date;
    } else if (dateFrom && dateTo) {
      // 日期范围模式
      const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      if (!dateSchema.safeParse(dateFrom).success || !dateSchema.safeParse(dateTo).success) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      queryDateFrom = dateFrom;
      queryDateTo = dateTo;
    } else {
      return res.status(400).json({ error: 'Please provide either "date" or both "date_from" and "date_to"' });
    }
    
    // 先从数据库查询（日期范围）
    let candidates = getCandidatesFromDBRange(queryDateFrom, queryDateTo);
    
    // 如果数据库没有或需要刷新，则采集（采集范围内的每一天）
    if (candidates.length === 0 || refresh) {
      const result = await collectAndSaveCandidatesRange(queryDateFrom, queryDateTo);
      candidates = getCandidatesFromDBRange(queryDateFrom, queryDateTo);
      res.json({
        candidates,
        collected: {
          openMeteo: result.openMeteo,
          meteoalarm: result.meteoalarm,
          efas: result.efas,
          gdacs: result.gdacs,
          total: result.openMeteo + result.meteoalarm + result.efas + result.gdacs
        },
        cached: !refresh,
        dateRange: { from: queryDateFrom, to: queryDateTo }
      });
    } else {
      res.json({
        candidates,
        cached: true,
        collected: { openMeteo: 0, meteoalarm: 0, efas: 0, gdacs: 0, total: 0 },
        dateRange: { from: queryDateFrom, to: queryDateTo }
      });
    }
  });
  
  // 强制刷新候选事件（支持日期范围）
  app.post('/events/candidates/refresh', async (req: Request, res: Response) => {
    const date = req.body.date as string;
    const dateFrom = req.body.date_from as string;
    const dateTo = req.body.date_to as string;
    
    let queryDateFrom: string;
    let queryDateTo: string;
    
    if (date) {
      queryDateFrom = date;
      queryDateTo = date;
    } else if (dateFrom && dateTo) {
      const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      if (!dateSchema.safeParse(dateFrom).success || !dateSchema.safeParse(dateTo).success) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      queryDateFrom = dateFrom;
      queryDateTo = dateTo;
    } else {
      return res.status(400).json({ error: 'Please provide either "date" or both "date_from" and "date_to"' });
    }
    
    const { collectAndSaveCandidatesRange } = await import('./service');
    const { getCandidatesFromDBRange } = await import('./service');
    const result = await collectAndSaveCandidatesRange(queryDateFrom, queryDateTo);
    const candidates = getCandidatesFromDBRange(queryDateFrom, queryDateTo);
    
    res.json({
      success: true,
      candidates,
      collected: {
        openMeteo: result.openMeteo,
        meteoalarm: result.meteoalarm,
        efas: result.efas,
        gdacs: result.gdacs,
        total: result.openMeteo + result.meteoalarm + result.efas + result.gdacs
      },
      dateRange: { from: queryDateFrom, to: queryDateTo }
    });
  });
  
  // 整理事件（多源采集+入库）
  app.post('/events/:candidateId/enrich', async (req: Request, res: Response) => {
    const candidateId = parseInt(req.params.candidateId);
    if (isNaN(candidateId)) {
      return res.status(400).json({ error: 'Invalid candidate ID' });
    }
    
    try {
      const { enrichEvent } = await import('./enrich');
      const result = await enrichEvent(candidateId);
      
      res.json({
        success: true,
        candidateId,
        recordsCreated: result.recordsCreated
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // 获取事件详细信息（包括原始数据）
  app.get('/events/:candidateId/details', async (req: Request, res: Response) => {
    const candidateId = parseInt(req.params.candidateId);
    if (isNaN(candidateId)) {
      return res.status(400).json({ error: 'Invalid candidate ID' });
    }
    
    const candidate = db.prepare('SELECT * FROM event_candidates WHERE id = ?').get(candidateId) as any;
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate event not found' });
    }
    
    // 解析原始数据
    let rawData = null;
    try {
      if (candidate.raw_data) {
        rawData = JSON.parse(candidate.raw_data);
      }
    } catch (e) {
      // 解析失败，保持为字符串
      rawData = candidate.raw_data;
    }
    
    res.json({
      candidate: {
        ...candidate,
        raw_data: rawData
      },
      // 查询相关的flood_records（根据国家、日期匹配）
      relatedRecords: db.prepare(`
        SELECT COUNT(*) as count, AVG(confidence) as avg_confidence, MAX(water_level) as max_water_level
        FROM flood_records
        WHERE country = ? AND substr(event_time, 1, 10) = ?
      `).get(candidate.country, candidate.event_date) as any
    });
  });
  
  // 获取事件汇总
  app.get('/events/:candidateId/summary', async (req: Request, res: Response) => {
    const candidateId = parseInt(req.params.candidateId);
    if (isNaN(candidateId)) {
      return res.status(400).json({ error: 'Invalid candidate ID' });
    }
    
    const candidate = db.prepare('SELECT * FROM event_candidates WHERE id = ?').get(candidateId) as any;
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate event not found' });
    }
    
    // 查询相关的flood_records（根据国家、日期匹配）
    const relatedRecords = db.prepare(`
      SELECT COUNT(*) as count, AVG(confidence) as avg_confidence, MAX(water_level) as max_water_level
      FROM flood_records
      WHERE country = ? AND substr(event_time, 1, 10) = ?
    `).get(candidate.country, candidate.event_date) as any;
    
    res.json({
      candidate,
      relatedRecords: {
        count: relatedRecords?.count || 0,
        avgConfidence: relatedRecords?.avg_confidence || 0,
        maxWaterLevel: relatedRecords?.max_water_level || 0
      }
    });
  });
}

