// 降雨事件查询路由（基于 rain_event 表）

import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';

export function registerRainEventsModule(app: Express) {
  // 查询降雨事件（支持日期范围和国家筛选）
  app.get('/events/rain', async (req: Request, res: Response) => {
    try {
      const dateFrom = req.query.date_from as string;
      const dateTo = req.query.date_to as string;
      const country = req.query.country as string;
      
      // 验证日期格式
      const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      
      if (!dateFrom || !dateTo) {
        return res.status(400).json({ error: '请提供 date_from 和 date_to 参数（格式：YYYY-MM-DD）' });
      }
      
      if (!dateSchema.safeParse(dateFrom).success || !dateSchema.safeParse(dateTo).success) {
        return res.status(400).json({ error: '日期格式错误，请使用 YYYY-MM-DD 格式' });
      }
      
      // 构建查询条件
      const where: string[] = ['date >= ? AND date <= ?'];
      const params: any[] = [dateFrom, dateTo];
      
      if (country && country.trim() !== '') {
        // 支持模糊搜索：spain, es, sp 等都能匹配 Spain
        const countryLower = country.trim().toLowerCase();
        // 如果输入很短（2-3个字符），可能是国家代码或缩写
        if (countryLower.length <= 3) {
          where.push('(LOWER(country) LIKE ? OR LOWER(country) LIKE ?)');
          params.push(`%${countryLower}%`, `${countryLower}%`);
        } else {
          // 完整或部分国家名称
          where.push('LOWER(country) LIKE ?');
          params.push(`%${countryLower}%`);
        }
      }
      
      const whereClause = `WHERE ${where.join(' AND ')}`;
      
      // 查询数据（按日期和国家分组统计）
      const query = `
        SELECT 
          date,
          country,
          province,
          COUNT(*) as event_count,
          COUNT(CASE WHEN searched = 1 THEN 1 END) as searched_count,
          COUNT(CASE WHEN searched = 0 THEN 1 END) as unsearched_count,
          AVG(value) as avg_value,
          MAX(value) as max_value,
          MIN(value) as min_value
        FROM rain_event
        ${whereClause}
        GROUP BY date, country, province
        ORDER BY date DESC, country ASC, province ASC
      `;
      
      const events = db.prepare(query).all(...params) as any[];
      
      // 查询详细数据（如果需要）
      const includeDetails = req.query.details === 'true';
      let details: any[] = [];
      let pagination = null;
      
      if (includeDetails) {
        // 分页参数
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        
        // 先查询总数
        const countQuery = `SELECT COUNT(*) as total FROM rain_event ${whereClause}`;
        const countResult = db.prepare(countQuery).get(...params) as any;
        const total = countResult?.total || 0;
        const totalPages = Math.ceil(total / limit);
        
        // 查询分页数据
        const detailsQuery = `
          SELECT 
            id, date, country, province, city, 
            longitude, latitude, value, threshold, 
            file_name, seq, searched
          FROM rain_event
          ${whereClause}
          ORDER BY date DESC, country ASC, province ASC, seq ASC
          LIMIT ? OFFSET ?
        `;
        details = db.prepare(detailsQuery).all(...params, limit, offset) as any[];
        
        pagination = {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        };
      }
      
      // 统计信息
      const statsQuery = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT date) as date_count,
          COUNT(DISTINCT country) as country_count,
          COUNT(DISTINCT province) as province_count,
          COUNT(CASE WHEN searched = 1 THEN 1 END) as total_searched,
          COUNT(CASE WHEN searched = 0 THEN 1 END) as total_unsearched
        FROM rain_event
        ${whereClause}
      `;
      const stats = db.prepare(statsQuery).get(...params) as any;
      
      res.json({
        success: true,
        dateRange: { from: dateFrom, to: dateTo },
        country: country || 'all',
        stats: {
          totalEvents: stats.total_events || 0,
          dateCount: stats.date_count || 0,
          countryCount: stats.country_count || 0,
          provinceCount: stats.province_count || 0,
          totalSearched: stats.total_searched || 0,
          totalUnsearched: stats.total_unsearched || 0
        },
        events: events,
        details: includeDetails ? details : undefined,
        pagination: pagination
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });
  
  // 获取单个降雨事件的详细信息
  app.get('/events/rain/:id', async (req: Request, res: Response) => {
    try {
      // 解码URL参数（处理特殊字符）
      const id = decodeURIComponent(req.params.id);
      const event = db.prepare('SELECT * FROM rain_event WHERE id = ?').get(id) as any;
      
      if (!event) {
        return res.status(404).json({ error: '事件未找到' });
      }
      
      res.json({
        success: true,
        event: {
          ...event,
          searched: event.searched === 1,
          searchedText: event.searched === 1 ? '已搜索' : '未搜索'
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });
  
  // 更新搜索状态
  app.post('/events/rain/:id/search', async (req: Request, res: Response) => {
    try {
      // 解码URL参数（处理特殊字符）
      const id = decodeURIComponent(req.params.id);
      const searched = req.body.searched === true || req.body.searched === 1 ? 1 : 0;
      
      const update = db.prepare('UPDATE rain_event SET searched = ? WHERE id = ?');
      const result = update.run(searched, id);
      
      if (result.changes === 0) {
        return res.status(404).json({ error: '事件未找到' });
      }
      
      res.json({
        success: true,
        id,
        searched: searched === 1,
        message: searched === 1 ? '已标记为已搜索' : '已标记为未搜索'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });
}

