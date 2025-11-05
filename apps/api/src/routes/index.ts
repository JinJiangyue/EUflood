import { Express, Request, Response } from 'express';
import { registerSearchModule } from '../modules/search/routes';
import { registerIngestionModule } from '../modules/ingestion/routes';
import { registerProcessingModule } from '../modules/processing/routes';
import { registerAnalysisModule } from '../modules/analysis/routes';
import { registerExportingModule } from '../modules/exporting/routes';

export function registerRoutes(app: Express) {
  app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));
  registerSearchModule(app);
  registerIngestionModule(app);
  registerProcessingModule(app);
  registerAnalysisModule(app);
  registerExportingModule(app);
}


