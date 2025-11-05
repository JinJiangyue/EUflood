import { Express, Request, Response } from 'express';
import { processNewRecords } from './service';

export function registerProcessingModule(app: Express) {
  app.post('/processing/run', (_req: Request, res: Response) => {
    const result = processNewRecords();
    res.json(result);
  });
}


