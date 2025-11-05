// 事件合并模块的路由

import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { queryAndMergeEvents, getMergedEventsFromDB } from './merger';

export function registerMergerModule(app: Express) {
  // 查询并合并事件（多平台）
  app.get('/events/merged', async (req: Request, res: Response) => {
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;
    const refresh = req.query.refresh === 'true';
    
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: 'Please provide both "date_from" and "date_to"' });
    }
    
    const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    if (!dateSchema.safeParse(dateFrom).success || !dateSchema.safeParse(dateTo).success) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // 先从数据库查询
    let mergedEvents = getMergedEventsFromDB(dateFrom, dateTo);
    
    // 如果数据库没有或需要刷新，则重新查询和合并
    if (mergedEvents.length === 0 || refresh) {
      const result = await queryAndMergeEvents(dateFrom, dateTo);
      mergedEvents = getMergedEventsFromDB(dateFrom, dateTo);
      
      res.json({
        events: mergedEvents,
        stats: result.stats,
        cached: !refresh,
        dateRange: { from: dateFrom, to: dateTo }
      });
    } else {
      res.json({
        events: mergedEvents,
        stats: {
          gdacs: 0,
          meteoalarm: 0,
          total: mergedEvents.reduce((sum, e) => sum + e.sourceCount, 0),
          merged: mergedEvents.length
        },
        cached: true,
        dateRange: { from: dateFrom, to: dateTo }
      });
    }
  });
  
  // 获取合并事件详情
  app.get('/events/merged/:id', async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }
    
    const stmt = db.prepare('SELECT * FROM merged_flood_events WHERE id = ?');
    const event = stmt.get(id) as any;
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json({
      id: event.id,
      globalEventKey: event.global_event_key,
      eventDate: event.event_date,
      country: event.country,
      city: event.city,
      latitude: event.latitude,
      longitude: event.longitude,
      timeFrom: event.time_from,
      timeTo: event.time_to,
      severity: event.severity,
      level: event.level,
      sources: JSON.parse(event.sources || '[]'),
      sourceCount: event.source_count,
      titles: JSON.parse(event.titles || '[]'),
      descriptions: JSON.parse(event.descriptions || '[]'),
      sourceUrls: JSON.parse(event.source_urls || '[]'),
      enriched: event.enriched === 1,
      enrichedAt: event.enriched_at,
      createdAt: event.created_at
    });
  });
}

