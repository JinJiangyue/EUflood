// Python模块路由
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { executePythonScript, executePythonScriptJSON } from './service';
import { checkPythonAvailable } from './utils/executor';
import { getRuntimeInfo } from './config';
import { uploadSingle, getFileInfo, cleanupFile } from './file-upload';
import path from 'path';
import { db } from '../../db';

export function registerPythonModule(app: Express) {
  console.log('[Python Module] Registering Python module routes...');
  
  // 获取运行环境信息
  app.get('/python/runtime', (_req: Request, res: Response) => {
    try {
      const info = getRuntimeInfo();
      res.json({
        success: true,
        ...info
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // 健康检查：检查Python是否可用
  app.get('/python/health', async (req: Request, res: Response) => {
    try {
      const pythonPath = (req.query.python_path as string) || process.env.PYTHON_PATH || 'python3';
      const available = await checkPythonAvailable(pythonPath);
      
      res.json({
        available,
        pythonPath,
        message: available ? 'Python is available' : 'Python is not available'
      });
    } catch (error: any) {
      res.status(500).json({
        available: false,
        error: error.message
      });
    }
  });
  
  // 文件上传接口
  app.post('/python/upload', (req: Request, res: Response) => {
    uploadSingle(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }
      
      try {
        const fileInfo = getFileInfo(req.file, process.cwd());
        res.json({
          success: true,
          file: fileInfo
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  });
  
  // 处理上传的文件（使用Python脚本）
  app.post('/python/process-file', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        fileId: z.string().optional(),
        filename: z.string().optional(),
        script: z.string().default('process_file.py'),
        options: z.record(z.any()).optional()
      });
      
      const { fileId, filename, script, options } = schema.parse(req.body);
      
      // 查找文件
      const { getUploadDir } = await import('./config');
      const uploadDir = getUploadDir();
      let filePath: string;
      
      if (filename) {
        filePath = path.join(uploadDir, filename);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either fileId or filename must be provided'
        });
      }
      
      // 检查文件是否存在
      const fs = await import('fs');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }
      
      // 调用Python脚本处理文件
      console.log(`[ProcessFile] Processing file: ${filePath}`);
      console.log(`[ProcessFile] Script: ${script}`);
      console.log(`[ProcessFile] Upload dir: ${uploadDir}`);
      
      const result = await executePythonScriptJSON(script, {
        input_file: filePath,
        ...options
      });
      
      if (result.success) {
        console.log(`[ProcessFile] Success: ${result.executionTime}ms`);
        res.json({
          success: true,
          data: result.data,
          executionTime: result.executionTime
        });
      } else {
        console.error(`[ProcessFile] Failed: ${result.error}`);
        console.error(`[ProcessFile] Execution time: ${result.executionTime}ms`);
        res.status(500).json({
          success: false,
          error: result.error || 'File processing failed',
          executionTime: result.executionTime,
          filePath: filePath,
          script: script
        });
      }
    } catch (error: any) {
      console.error(`[ProcessFile] Exception:`, error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // 上传 + 运行插值 + 写入 rain_event（使用前端确认日期）
  app.post('/python/rain/process-upload', (req: Request, res: Response) => {
    uploadSingle(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message || 'File upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const confirmedDate = (req.body as any)?.confirmed_date;
      const valueThreshold = (req.body as any)?.value_threshold;
      if (!confirmedDate) {
        return res.status(400).json({ success: false, error: 'confirmed_date is required (YYYY-MM-DD)' });
      }

      try {
        const fileInfo = getFileInfo(req.file, process.cwd());
        const inputFile = fileInfo.path;

        // 与 /python/interpolation 保持一致：自动解析默认 GeoJSON 与 LAU 数据源
        const { getPythonScriptDir } = await import('./config');
        const scriptDir = getPythonScriptDir();
        const fs = await import('fs');
        const pathMod = await import('path');

        // 默认域 GeoJSON（若存在）
        let geojsonPath: string | undefined;
        const defaultGeo = pathMod.join(scriptDir, 'data', 'domain_xinyu_20250729_093415.geojson');
        if (fs.existsSync(defaultGeo)) geojsonPath = defaultGeo;

        // NUTS/LAU 候选（优先请求体覆盖，其次默认）
        const resolveDataPath = (p?: string) => p ? (pathMod.isAbsolute(p) ? p : pathMod.join(scriptDir, 'data', p)) : undefined;
        const reqNuts = resolveDataPath((req.body as any)?.nuts_file);
        const reqLau = resolveDataPath((req.body as any)?.lau_file);
        const nutsCandidates = [reqNuts, pathMod.join(scriptDir, 'data', 'NUTS_RG_20M_2021_4326.gpkg'), pathMod.join(scriptDir, 'data', 'NUTS_RG_20M_2021_4326.geojson')].filter(Boolean) as string[];
        const lauCandidates = [reqLau, pathMod.join(scriptDir, 'data', 'LAU_2019.gpkg'), pathMod.join(scriptDir, 'data', 'LAU_2019.geojson')].filter(Boolean) as string[];
        const findFirstExisting = (cands: string[]) => cands.find(p => fs.existsSync(p));
        const nuts_file = findFirstExisting(nutsCandidates);
        const lau_file = findFirstExisting(lauCandidates);

        // 调用 Python 插值脚本（传递阈值/域GeoJSON/LAU，并启用每多边形取最大值）
        const result = await executePythonScriptJSON<any>('interpolation.py', {
          input_file: inputFile,
          value_threshold: valueThreshold ? parseFloat(String(valueThreshold)) : 50.0,
          max_points: 1000,
          geojson_file: geojsonPath,
          take_max_per_polygon: true,
          nuts_file,
          lau_file
        }, { timeout: 120000 });

        if (!result.success) {
          cleanupFile(inputFile);
          return res.status(500).json({ success: false, error: result.error || 'interpolation failed' });
        }

        const data = result.data as any;
        // Python 返回的结构：{ success: true, summary: {...}, points: [...] }
        const threshold = data?.summary?.value_threshold ?? null;
        const points: any[] = Array.isArray(data?.points) ? data.points : [];

        // 批量写入 rain_event（应用层计算 seq 与 id）
        const insertStmt = db.prepare(`
          INSERT INTO rain_event
          (id, date, country, province, city, longitude, latitude, value, threshold, file_name, seq, searched)
          VALUES (@id, @date, @country, @province, @city, @longitude, @latitude, @value, @threshold, @file_name, @seq, @searched)
        `);
        const tx = db.transaction((rows: any[]) => { rows.forEach(r => insertStmt.run(r)); });

        // 计算每个 (date, province) 的起始 seq（保留旧记录，避免覆盖已搜索的数据）
        const dateStr = String(confirmedDate);
        const ymd = dateStr.replace(/-/g, '');
        const sanitizeProvince = (s: string) => (s || 'UNKNOWN').replace(/\s+/g, '_');
        const getMaxSeqStmt = db.prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM rain_event WHERE date = ? AND province = ?`);
        
        // 检查是否已存在相同记录（date + file_name + longitude + latitude）
        const checkExistsStmt = db.prepare(`SELECT id FROM rain_event WHERE date = ? AND file_name = ? AND longitude = ? AND latitude = ?`);

        // 先统计各省份数量，查询现有 max seq，只查一次
        const provinceToCount = new Map<string, number>();
        for (const p of points) {
          const province = sanitizeProvince(p.province_name || 'UNKNOWN');
          provinceToCount.set(province, (provinceToCount.get(province) || 0) + 1);
        }
        const provinceToNextSeq = new Map<string, number>();
        for (const [province] of provinceToCount) {
          const row = getMaxSeqStmt.get(dateStr, province) as any;
          const start = (row?.maxSeq || 0) + 1;
          provinceToNextSeq.set(province, start);
        }

        // 生成行（带 id/seq），跳过已存在的记录（保留已搜索的数据）
        const rows: any[] = [];
        for (const p of points) {
          const province = sanitizeProvince(p.province_name || 'UNKNOWN');
          const lon = Number(p.longitude);
          const lat = Number(p.latitude);
          
          // 检查是否已存在相同记录（date + file_name + longitude + latitude）
          const existing = checkExistsStmt.get(dateStr, req.file!.originalname, lon, lat) as any;
          if (existing) {
            // 已存在，跳过（保留旧记录，包括 searched 状态）
            continue;
          }
          
          // 不存在，计算 seq 并生成新记录
          const next = provinceToNextSeq.get(province) || 1;
          provinceToNextSeq.set(province, next + 1);
          const seq = next;
          const id = `${ymd}_${province}_${seq}`;
          rows.push({
            id,
            date: dateStr,
            country: p.country_name ?? null,
            province,
            city: p.city_name ?? null,
            longitude: lon,
            latitude: lat,
            value: p.value != null ? Number(p.value) : null,
            threshold: threshold != null ? Number(threshold) : null,
            file_name: req.file!.originalname,
            seq,
            searched: 0
          });
        }

        tx(rows);
        cleanupFile(inputFile);
        // 返回入库结果和插值数据（用于前端显示）
        // data 是 Python 返回的整个对象：{ success: true, summary: {...}, points: [...] }
        return res.json({ 
          success: true, 
          inserted: rows.length,
          data: data // 返回插值结果，包含 points 和 summary
        });
      } catch (e: any) {
        return res.status(500).json({ success: false, error: e?.message || String(e) });
      }
    });
  });
  
  // 执行Python脚本（返回文本输出）
  app.post('/python/execute', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        script: z.string().min(1),
        args: z.record(z.any()).optional(),
        timeout: z.number().optional(),
        python_path: z.string().optional()
      });
      
      const { script, args, timeout, python_path } = schema.parse(req.body);
      
      const result = await executePythonScript(script, args, {
        timeout,
        pythonPath: python_path
      });
      
      if (result.success) {
        res.json({
          success: true,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime
        });
      } else {
        res.status(500).json({
          success: false,
          output: result.output,
          error: result.error,
          executionTime: result.executionTime
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  });
  
  // 执行Python脚本（返回JSON输出）
  app.post('/python/execute-json', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        script: z.string().min(1),
        args: z.record(z.any()).optional(),
        timeout: z.number().optional(),
        python_path: z.string().optional()
      });
      
      const { script, args, timeout, python_path } = schema.parse(req.body);
      
      const result = await executePythonScriptJSON(script, args, {
        timeout,
        pythonPath: python_path
      });
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          error: result.error,
          executionTime: result.executionTime
        });
      } else {
        res.status(500).json({
          success: false,
          data: null,
          error: result.error,
          executionTime: result.executionTime
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  });
  
  // 空间插值分析接口
  app.post('/python/interpolation', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        filename: z.string().optional(),
        fileId: z.string().optional(),
        value_threshold: z.number().optional(),
        max_points: z.number().optional().default(1000),
        geojson_file: z.string().optional(),
        take_max_per_polygon: z.boolean().optional().default(true),
        timeout: z.number().optional()
      });
      
      const { filename, fileId, value_threshold, max_points, geojson_file, take_max_per_polygon, timeout } = schema.parse(req.body);
      
      // 查找输入文件
      const { getUploadDir } = await import('./config');
      const uploadDir = getUploadDir();
      
      let inputFile: string;
      if (filename) {
        inputFile = path.join(uploadDir, filename);
      } else if (fileId) {
        inputFile = path.join(uploadDir, fileId);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either filename or fileId must be provided'
        });
      }
      
      // 检查文件是否存在
      const fs = await import('fs');
      if (!fs.existsSync(inputFile)) {
        return res.status(404).json({
          success: false,
          error: `Input file not found: ${inputFile}`
        });
      }
      
      // 查找GeoJSON文件路径（如果提供）
      let geojsonPath: string | undefined;
      if (geojson_file) {
        const { getPythonScriptDir } = await import('./config');
        const scriptDir = getPythonScriptDir();
        
        if (path.isAbsolute(geojson_file)) {
          geojsonPath = geojson_file;
        } else {
          // 默认在 scripts/data 目录下
          geojsonPath = path.join(scriptDir, 'data', geojson_file);
        }
        
        // 检查文件是否存在
        if (!fs.existsSync(geojsonPath)) {
          return res.status(404).json({
            success: false,
            error: `GeoJSON file not found: ${geojsonPath}`
          });
        }
      } else {
        // 如果没有提供，使用默认的GeoJSON文件
        const { getPythonScriptDir } = await import('./config');
        const scriptDir = getPythonScriptDir();
        const defaultGeoJSON = path.join(scriptDir, 'data', 'domain_xinyu_20250729_093415.geojson');
        if (fs.existsSync(defaultGeoJSON)) {
          geojsonPath = defaultGeoJSON;
        }
      }
      
      // 查找 NUTS/LAU 数据源（可选，支持多候选与请求体覆盖）
      const { getPythonScriptDir } = await import('./config');
      const scriptDir = getPythonScriptDir();
      const resolveDataPath = (p?: string) => {
        if (!p) return undefined;
        return path.isAbsolute(p) ? p : path.join(scriptDir, 'data', p);
      };

      // 允许请求体直接传入（可选）
      const reqNuts = resolveDataPath((req.body as any).nuts_file);
      const reqLau = resolveDataPath((req.body as any).lau_file);

      // 默认候选列表
      const nutsCandidates = [
        reqNuts,
        path.join(scriptDir, 'data', 'NUTS_RG_20M_2021_4326.gpkg'),
        path.join(scriptDir, 'data', 'NUTS_RG_20M_2021_4326.geojson')
      ].filter(Boolean) as string[];

      const lauCandidates = [
        reqLau,
        // 仅使用 2019 版作为默认 LAU 数据源（优先）
        path.join(scriptDir, 'data', 'LAU_2019.gpkg'),
        path.join(scriptDir, 'data', 'LAU_2019.geojson')
      ].filter(Boolean) as string[];

      const findFirstExisting = (cands: string[]) => cands.find(p => fs.existsSync(p));
      const nuts_file = findFirstExisting(nutsCandidates);
      const lau_file = findFirstExisting(lauCandidates);

      // 调用Python脚本
      const result = await executePythonScriptJSON('interpolation.py', {
        input_file: inputFile,
        value_threshold: value_threshold || undefined,
        max_points: max_points,
        geojson_file: geojsonPath || undefined,
        take_max_per_polygon: take_max_per_polygon !== false,
        nuts_file,
        lau_file
      }, {
        timeout: timeout || 120000 // 增加超时时间，因为需要处理GeoJSON
      });
      
      if (result.success) {
        res.json({
          success: true,
          data: result.data,
          executionTime: result.executionTime
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Unknown error occurred',
          executionTime: result.executionTime
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request body',
          details: error.errors
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  });
  
  // 查询 rain_event 表统计信息
  app.get('/python/rain/stats', (_req: Request, res: Response) => {
    try {
      const total = db.prepare(`SELECT COUNT(*) AS count FROM rain_event`).get() as any;
      const byDate = db.prepare(`
        SELECT date, COUNT(*) AS count 
        FROM rain_event 
        GROUP BY date 
        ORDER BY date DESC 
        LIMIT 10
      `).all() as any[];
      const byProvince = db.prepare(`
        SELECT province, COUNT(*) AS count 
        FROM rain_event 
        GROUP BY province 
        ORDER BY count DESC 
        LIMIT 10
      `).all() as any[];
      
      res.json({
        success: true,
        total: total?.count || 0,
        byDate,
        byProvince
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || String(e)
      });
    }
  });

  // 查询 rain_event 表所有数据（支持分页和筛选）
  app.get('/python/rain/list', (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = (page - 1) * limit;
      const date = req.query.date as string;
      const province = req.query.province as string;
      const country = req.query.country as string;

      // 构建 WHERE 条件
      const where: string[] = [];
      const params: any = {};
      
      if (date) {
        where.push('date = @date');
        params.date = date;
      }
      if (province) {
        where.push('province = @province');
        params.province = province;
      }
      if (country) {
        where.push('country = @country');
        params.country = country;
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      
      // 查询总数
      const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM rain_event ${whereClause}`);
      const total = (where.length > 0 ? countStmt.get(params) : countStmt.get()) as any;
      
      // 查询数据
      const dataStmt = db.prepare(`
        SELECT id, date, country, province, city, longitude, latitude, value, threshold, file_name, seq, searched
        FROM rain_event 
        ${whereClause}
        ORDER BY date DESC, seq ASC
        LIMIT @limit OFFSET @offset
      `);
      params.limit = limit;
      params.offset = offset;
      const data = (where.length > 0 ? dataStmt.all(params) : dataStmt.all({ limit, offset })) as any[];

      res.json({
        success: true,
        total: total?.count || 0,
        page,
        limit,
        totalPages: Math.ceil((total?.count || 0) / limit),
        data
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || String(e)
      });
    }
  });

  // 读取GeoJSON文件接口
  app.get('/python/geojson/:filename', async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      
      // 检查文件名安全性
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
      }
      
      // 构建文件路径（在scripts/data目录下）
      const { getPythonScriptDir } = await import('./config');
      const scriptDir = getPythonScriptDir();
      // 直接使用scripts目录下的data子目录
      const geojsonPath = path.join(scriptDir, 'data', filename);
      
      // 检查文件是否存在
      const fs = await import('fs');
      if (!fs.existsSync(geojsonPath)) {
        return res.status(404).json({
          success: false,
          error: 'GeoJSON file not found'
        });
      }
      
      // 读取并返回GeoJSON文件
      const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
      const geojsonData = JSON.parse(geojsonContent);
      
      res.json({
        success: true,
        data: geojsonData
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  });
}

