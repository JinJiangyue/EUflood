import { Express, Request, Response } from 'express';
import { runTriggerCheck } from './service';

export function registerTriggerModule(app: Express) {
  // 手动触发检查
  app.post('/trigger/check', async (_req: Request, res: Response) => {
    try {
      const result = await runTriggerCheck();
      res.json({
        success: true,
        checked: result.checked,
        triggered: result.triggered,
        message: `Checked ${result.checked} locations, ${result.triggered} triggers activated`
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // 获取触发器状态
  app.get('/trigger/status', (_req: Request, res: Response) => {
    res.json({
      triggerSource: 'Open-Meteo API',
      monitoringPoints: 16,
      checkInterval: '10 minutes',
      thresholds: {
        precipitation: '5mm/h',
        precipitation24h: '20mm/24h'
      }
    });
  });
}

