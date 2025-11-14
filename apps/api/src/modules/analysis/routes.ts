import { Express, Request, Response } from 'express';
import { dbFind, dbCount } from '../../db-helper';

export function registerAnalysisModule(app: Express) {
  // 使用 rain_event 和 rain_flood_impact 表的统计接口
  app.get('/analysis/summary', async (_req: Request, res: Response) => {
    try {
      // 统计 rain_event 表
      const totalEvents = await dbCount('rain_event');
      const searchedEvents = await dbCount('rain_event', 'searched = 1');
      const unsearchedEvents = await dbCount('rain_event', 'searched = 0');
      
      // 统计 rain_flood_impact 表
      const totalImpacts = await dbCount('rain_flood_impact');
      
      // 获取所有记录进行聚合计算
      const allEvents = await dbFind('rain_event', { filter: 'value != null && value != ""' });
      const allImpacts = await dbFind('rain_flood_impact', { filter: 'level != null && level != ""' });
      
      // 计算平均值和最大值
      const values = allEvents.map(e => e.value).filter(v => v != null && !isNaN(v)) as number[];
      const levels = allImpacts.map(i => i.level).filter(l => l != null && !isNaN(l)) as number[];
      
      const avgValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const maxValue = values.length > 0 ? Math.max(...values) : 0;
      const avgLevel = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
      const maxLevel = levels.length > 0 ? Math.max(...levels) : 0;
      
      res.json({
        total_records: totalEvents,
        processed_records: searchedEvents,
        unprocessed_records: unsearchedEvents,
        total_impacts: totalImpacts,
        average_risk: avgLevel,
        max_risk_level: maxLevel,
        average_rainfall: avgValue,
        max_rainfall: maxValue
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message || 'Failed to fetch analysis summary'
      });
    }
  });
}


