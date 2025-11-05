import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { ingestDemoFloodRecords } from './service';

export function registerIngestionModule(app: Express) {
  const schema = z.object({ count: z.coerce.number().int().min(1).max(1000).optional() });
  app.post('/ingestion/run', (req: Request, res: Response) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const num = ingestDemoFloodRecords({ count: parsed.data.count });
    res.json({ inserted: num });
  });
}


