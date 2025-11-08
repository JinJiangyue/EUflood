import { Express, Request, Response } from 'express';
import { db } from '../../db';

export function registerAnalysisModule(app: Express) {
  // 使用 rain_event 和 rain_flood_impact 表的统计接口
  app.get('/analysis/summary', (_req: Request, res: Response) => {
    try {
      // 统计 rain_event 表
      const totalEvents = db.prepare(`SELECT COUNT(*) AS total FROM rain_event`).get() as any;
      const searchedEvents = db.prepare(`SELECT COUNT(*) AS cnt FROM rain_event WHERE searched = 1`).get() as any;
      const unsearchedEvents = db.prepare(`SELECT COUNT(*) AS cnt FROM rain_event WHERE searched = 0`).get() as any;
      
      // 统计 rain_flood_impact 表
      const totalImpacts = db.prepare(`SELECT COUNT(*) AS total FROM rain_flood_impact`).get() as any;
      const avgLevel = db.prepare(`SELECT AVG(level) AS avg_level FROM rain_flood_impact WHERE level IS NOT NULL`).get() as any;
      const maxLevel = db.prepare(`SELECT MAX(level) AS max_level FROM rain_flood_impact WHERE level IS NOT NULL`).get() as any;
      
      // 统计平均降雨值
      const avgValue = db.prepare(`SELECT AVG(value) AS avg_value FROM rain_event WHERE value IS NOT NULL`).get() as any;
      const maxValue = db.prepare(`SELECT MAX(value) AS max_value FROM rain_event WHERE value IS NOT NULL`).get() as any;
      
      res.json({
        total_records: totalEvents?.total ?? 0,
        processed_records: searchedEvents?.cnt ?? 0,
        unprocessed_records: unsearchedEvents?.cnt ?? 0,
        total_impacts: totalImpacts?.total ?? 0,
        average_risk: avgLevel?.avg_level ?? 0,
        max_risk_level: maxLevel?.max_level ?? 0,
        average_rainfall: avgValue?.avg_value ?? 0,
        max_rainfall: maxValue?.max_value ?? 0
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to fetch analysis summary'
      });
    }
  });
}


