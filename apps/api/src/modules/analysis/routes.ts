import { Express, Request, Response } from 'express';
import { db } from '../../db';

export function registerAnalysisModule(app: Express) {
  app.get('/analysis/summary', (_req: Request, res: Response) => {
    const totals = db.prepare(`SELECT COUNT(*) AS total FROM flood_records`).get() as any;
    const processed = db.prepare(`SELECT COUNT(*) AS cnt FROM flood_records WHERE status = 'processed'`).get() as any;
    const avgRisk = db.prepare(`SELECT AVG(risk_score) AS avg_risk FROM flood_records WHERE risk_score IS NOT NULL`).get() as any;
    const maxWl = db.prepare(`SELECT MAX(water_level) AS max_wl FROM flood_records`).get() as any;
    res.json({
      total_records: totals?.total ?? 0,
      processed_records: processed?.cnt ?? 0,
      average_risk: avgRisk?.avg_risk ?? 0,
      max_water_level: maxWl?.max_wl ?? 0
    });
  });
}


