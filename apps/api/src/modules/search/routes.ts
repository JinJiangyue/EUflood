import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';

export function registerSearchModule(app: Express) {
  // TODO: 重构为使用 rain_event 和 rain_flood_impact 表
  // 暂时禁用，等待重构
  return;
  
  /* 注释掉：使用 flood_records 表的旧代码
  const querySchema = z.object({
    q: z.string().optional(),
    country: z.string().optional(),
    date: z.string().optional(),
    severity: z.string().optional()
  });

  app.get('/search', (req: Request, res: Response) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { q, country, date, severity } = (parsed.data as { q?: string; country?: string; date?: string; severity?: string }) || {};

    const baseSelect = `
      SELECT id, record_id, title, description, water_level, status, risk_score, created_at, processed_at,
             country, specific_location, event_time, coordinates, severity, type,
             source_type, source_name, source_url, confidence, evidence_count, metadata
      FROM flood_records`;

    // 动态 WHERE 构建
    const where: string[] = [];
    const params: Record<string, any> = {};
    if (q && q.trim() !== '') {
      where.push(`(description LIKE @kw OR title LIKE @kw OR country LIKE @kw OR specific_location LIKE @kw)`);
      params.kw = `%${q}%`;
    }
    if (country && country.trim() !== '') {
      where.push(`country = @country`);
      params.country = country;
    }
    if (severity && severity.trim() !== '') {
      where.push(`LOWER(severity) = LOWER(@severity)`);
      params.severity = severity;
    }
    if (date && date.trim() !== '') {
      // 按日过滤：event_time 以该日期开头 或 created_at 日期等于该日
      where.push(`(substr(event_time,1,10) = @date OR substr(created_at,1,10) = @date)`);
      params.date = date;
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const stmt = db.prepare(`${baseSelect}${whereSql}
      ORDER BY confidence DESC, COALESCE(datetime(event_time), datetime(created_at)) DESC
      LIMIT 50`);
    const items = stmt.all(params) as any[];
    // 解析 JSON 字段
    const parsedItems = items.map(r => ({
      ...r,
      coordinates: r.coordinates ? JSON.parse(r.coordinates) : null,
      metadata: r.metadata ? JSON.parse(r.metadata) : {}
    }));
    res.json({ items: parsedItems });
  });

  const bodySchema = z.object({ description: z.string().min(1), water_level: z.number().optional() });
  app.post('/records', (req: Request, res: Response) => {
    const parse = bodySchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const { description, water_level } = parse.data;

    const insert = db.prepare(`
      INSERT INTO flood_records (description, water_level, status, created_at)
      VALUES (?, ?, 'new', datetime('now'))
    `);
    const info = insert.run(description, water_level ?? null);
    res.status(201).json({ id: info.lastInsertRowid });
  });
  */
}


