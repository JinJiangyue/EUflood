import { Express, Request, Response } from 'express';
import { db } from '../../db';

export function registerExportingModule(app: Express) {
  app.get('/export', (_req: Request, res: Response) => {
    const rows = db.prepare(`
      SELECT record_id, id, title, description, water_level, status, risk_score, created_at, processed_at,
             country, specific_location, event_time, coordinates, severity, type,
             source_type, source_name, source_url, confidence, evidence_count
      FROM flood_records
      ORDER BY confidence DESC, COALESCE(datetime(event_time), datetime(created_at)) DESC
    `).all() as any[];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="flood_records.csv"');
    const headers = ['record_id','id','country','specific_location','event_time','title','description','water_level','severity','type','status','source_type','source_name','source_url','confidence','evidence_count','risk_score','coordinates','created_at','processed_at'];
    res.write(headers.join(',') + '\n');
    for (const r of rows) {
      const line = [
        r.record_id ?? '', r.id, r.country ?? '', r.specific_location ?? '', r.event_time ?? '',
        r.title ?? '', r.description ?? '', r.water_level ?? '', r.severity ?? '', r.type ?? '',
        r.status ?? '', r.source_type ?? '', r.source_name ?? '', r.source_url ?? '',
        r.confidence ?? '', r.evidence_count ?? '', r.risk_score ?? '',
        r.coordinates ?? '', r.created_at ?? '', r.processed_at ?? ''
      ].map(v => typeof v === 'string' ? '"' + v.replace(/"/g, '""') + '"' : v).join(',');
      res.write(line + '\n');
    }
    res.end();
  });
}


