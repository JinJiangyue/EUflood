// Python模块路由
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { executePythonScript, executePythonScriptJSON } from './service';
import { checkPythonAvailable } from './utils/executor';
import { getRuntimeInfo } from './config';
import { uploadSingle, getFileInfo, cleanupFile } from './file-upload';
import path from 'path';
import fs from 'fs';
import { db } from '../src/db';

/**
 * 构建网格阈值参数（grid 模式）
 */
function buildGridThresholdArgs(
  thresholdMode: string | undefined,
  gridRpForFilter: string | undefined,
  gridInterpMethod: string | undefined,
  valueThreshold: number | string | undefined,
  thresholdDir: string
): Record<string, any> {
  const args: Record<string, any> = {};
  
  if (String(thresholdMode || '').toLowerCase() === 'grid') {
    args.threshold_mode = 'grid';
    args.grid_rp_for_filter = (gridRpForFilter || '005y').toLowerCase();
    args.grid_interp_method = (gridInterpMethod || 'nearest').toLowerCase();
    
    const nc002 = path.join(thresholdDir, 'idfceu_opera_efas4326_1amin_24h_002y.nc');
    const nc005 = path.join(thresholdDir, 'idfceu_opera_efas4326_1amin_24h_005y.nc');
    const nc020 = path.join(thresholdDir, 'idfceu_opera_efas4326_1amin_24h_020y.nc');
    
    if (fs.existsSync(nc002)) args.nc_002y = nc002;
    if (fs.existsSync(nc005)) args.nc_005y = nc005;
    if (fs.existsSync(nc020)) args.nc_020y = nc020;
    args.grid_fallback = Number(valueThreshold) || 50.0;
  }
  
  return args;
}

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
    console.log('[Upload] Received upload request');
    uploadSingle(req, res, (err: any) => {
      if (err) {
        console.error('[Upload] Error:', err);
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed',
          details: err.code || 'UNKNOWN_ERROR'
        });
      }
      
      if (!req.file) {
        console.error('[Upload] No file in request');
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          details: 'Request does not contain a file'
        });
      }
      
      try {
        console.log('[Upload] File uploaded successfully:', {
          originalname: req.file.originalname,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path
        });
        const fileInfo = getFileInfo(req.file, process.cwd());
        console.log('[Upload] File saved to:', fileInfo.path);
        res.json({
          success: true,
          file: fileInfo
        });
      } catch (error: any) {
        console.error('[Upload] Processing error:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to process uploaded file'
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
      const thresholdMode = (req.body as any)?.threshold_mode; // fixed | grid
      const gridRpForFilter = (req.body as any)?.grid_rp_for_filter; // 002y|005y|020y
      const gridInterpMethod = (req.body as any)?.grid_interp_method; // nearest|linear
      if (!confirmedDate) {
        return res.status(400).json({ success: false, error: 'confirmed_date is required (YYYY-MM-DD)' });
      }

      try {
        const fileInfo = getFileInfo(req.file, process.cwd());
        const inputFile = fileInfo.path;

        // 与 /python/interpolation 保持一致：自动解析默认 GeoJSON 与 LAU 数据源
        const { getGeoFileDir } = await import('./config');
        const geoFileDir = getGeoFileDir();
        const fs = await import('fs');
        const pathMod = await import('path');

        // 默认域 GeoJSON（从新位置读取）
        let geojsonPath: string | undefined;
        const defaultGeo = pathMod.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson');
        if (fs.existsSync(defaultGeo)) {
          geojsonPath = defaultGeo;
        }

        // 阈值网格（NC）默认目录：与 uploads 同级的 threshold_file
        const { getUploadDir } = await import('./config');
        const uploadDir = getUploadDir();
        const uploadsRoot = pathMod.dirname(uploadDir);
        const thresholdDir = pathMod.join(uploadsRoot, 'threshold_file');

        // NUTS/LAU 候选（优先请求体覆盖，其次默认，使用新位置）
        const resolveDataPath = (p?: string, subdir?: string) => {
          if (!p) return undefined;
          if (pathMod.isAbsolute(p)) return p;
          if (subdir) {
            return pathMod.join(geoFileDir, subdir, p);
          }
          return p;
        };
        const reqNuts = resolveDataPath((req.body as any)?.nuts_file, 'nuts3');
        const reqLau = resolveDataPath((req.body as any)?.lau_file, 'city');
        const nutsCandidates = [
          reqNuts,
          pathMod.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.gpkg'),
          pathMod.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.geojson'),
          pathMod.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson')
        ].filter(Boolean) as string[];
        const lauCandidates = [
          reqLau,
          pathMod.join(geoFileDir, 'city', 'LAU_2019.gpkg'),
          pathMod.join(geoFileDir, 'city', 'LAU_2019.geojson')
        ].filter(Boolean) as string[];
        const findFirstExisting = (cands: string[]) => cands.find(p => fs.existsSync(p));
        const nuts_file = findFirstExisting(nutsCandidates);
        const lau_file = findFirstExisting(lauCandidates);

        // 调用 Python 插值脚本（传递阈值/域GeoJSON/LAU，并启用每多边形取最大值）
        const pyArgs: Record<string, any> = {
          input_file: inputFile,
          value_threshold: valueThreshold ? parseFloat(String(valueThreshold)) : 50.0,
          max_points: 1000,
          geojson_file: geojsonPath,
          take_max_per_polygon: true,
          nuts_file,
          lau_file,
          ...buildGridThresholdArgs(thresholdMode, gridRpForFilter, gridInterpMethod, valueThreshold, thresholdDir)
        };

        const result = await executePythonScriptJSON<any>('interpolation.py', pyArgs, { timeout: 120000 });

        if (!result.success) {
          cleanupFile(inputFile);
          return res.status(500).json({ success: false, error: result.error || 'interpolation failed' });
        }

        const data = result.data as any;
        // Python 返回的结构：{ success: true, summary: {...}, points: [...] }
        const thresholdModeUsed = String(data?.summary?.threshold_mode || '').toLowerCase();
        const rpUsed = String(data?.summary?.grid_rp_for_filter || '').toLowerCase(); // 002y/005y/020y
        const rpKeyMap: Record<string, string> = {
          '002y': 'threshold_2y',
          '005y': 'threshold_5y',
          '020y': 'threshold_20y'
        };
        const thresholdKeyFromGrid = rpKeyMap[rpUsed] || (rpUsed ? `threshold_${rpUsed}` : null);
        const defaultThresholdValue = data?.summary?.value_threshold ?? null;
        const points: any[] = Array.isArray(data?.points) ? data.points : [];

        // 批量写入 rain_event（应用层计算 seq 与 id）
        const insertStmt = db.prepare(`
          INSERT INTO rain_event
          (id, date, country, province, city, longitude, latitude, value, threshold, return_period_band, return_period_estimate, file_name, seq, searched)
          VALUES (@id, @date, @country, @province, @city, @longitude, @latitude, @value, @threshold, @return_period_band, @return_period_estimate, @file_name, @seq, @searched)
        `);
        const tx = db.transaction((rows: any[]) => { rows.forEach(r => insertStmt.run(r)); });

        // 计算每个 (date, province) 的起始 seq（保留旧记录，避免覆盖已搜索的数据）
        const dateStr = String(confirmedDate);
        const ymd = dateStr.replace(/-/g, '');
        // 获取省份名称（用于存储到数据库）：只保留 "/" 前的部分，保留空格
        const getProvinceName = (s: string) => {
          const str = s || 'UNKNOWN';
          // 只保留 "/" 前的英文部分，保留空格
          return str.split('/')[0].trim();
        };
        // 获取省份名称（用于生成 ID）：只保留 "/" 前的部分，替换空格为下划线
        const getProvinceForId = (s: string) => {
          const str = s || 'UNKNOWN';
          // 只保留 "/" 前的英文部分
          const beforeSlash = str.split('/')[0].trim();
          // 替换空格为下划线（用于生成 ID）
          return beforeSlash.replace(/\s+/g, '_');
        };
        const getMaxSeqStmt = db.prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM rain_event WHERE date = ? AND province = ?`);
        
        // 检查是否已存在相同记录（date + file_name + longitude + latitude）
        const checkExistsStmt = db.prepare(`SELECT id FROM rain_event WHERE date = ? AND file_name = ? AND longitude = ? AND latitude = ?`);

        // 先统计各省份数量，查询现有 max seq，只查一次
        const provinceToCount = new Map<string, number>();
        for (const p of points) {
          const province = getProvinceName(p.province_name || 'UNKNOWN');
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
          const province = getProvinceName(p.province_name || 'UNKNOWN'); // 用于存储到数据库
          const provinceForId = getProvinceForId(p.province_name || 'UNKNOWN'); // 用于生成 ID
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
          const id = `${ymd}_${provinceForId}_${seq}`; // 使用替换空格后的版本生成 ID
          // 选择阈值：grid 模式用每点阈值，否则用默认阈值
          let rowThreshold: number | null = null;
          if (thresholdModeUsed === 'grid') {
            let tv: any = thresholdKeyFromGrid ? p[thresholdKeyFromGrid] : undefined;
            if ((tv === undefined || tv === null || tv === '') && rpUsed) {
              const fallbackKey = `threshold_${rpUsed}`;
              tv = p[fallbackKey];
            }
            rowThreshold = tv != null ? Number(tv) : (defaultThresholdValue != null ? Number(defaultThresholdValue) : null);
          } else {
            rowThreshold = defaultThresholdValue != null ? Number(defaultThresholdValue) : null;
          }

          const band = p.return_period_band != null ? String(p.return_period_band) : null;
          const estimate = p.return_period_estimate != null && p.return_period_estimate !== '' ? Number(p.return_period_estimate) : null;

          rows.push({
            id,
            date: dateStr,
            country: p.country_name ?? null,
            province, // 存储保留空格的版本
            city: p.city_name ?? null,
            longitude: lon,
            latitude: lat,
            value: p.value != null ? Number(p.value) : null,
            threshold: rowThreshold,
            return_period_band: band,
            return_period_estimate: estimate,
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
  
  // 降雨导入接口
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
      
      // 获取地理数据文件目录
      const { getGeoFileDir } = await import('./config');
      const geoFileDir = getGeoFileDir();
      
      // 查找GeoJSON文件路径（如果提供）
      let geojsonPath: string | undefined;
      if (geojson_file) {
        if (path.isAbsolute(geojson_file)) {
          geojsonPath = geojson_file;
        } else {
          // 默认在 apps/uploads/geofile/nuts3/ 目录下
          geojsonPath = path.join(geoFileDir, 'nuts3', geojson_file);
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
        const defaultGeoJSON = path.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson');
        if (fs.existsSync(defaultGeoJSON)) {
          geojsonPath = defaultGeoJSON;
        }
      }
      
      // 查找 NUTS/LAU 数据源（可选，支持多候选与请求体覆盖）
      const resolveDataPath = (p?: string, subdir?: string) => {
        if (!p) return undefined;
        if (path.isAbsolute(p)) return p;
        // 如果指定了子目录，使用新的地理数据目录
        if (subdir) {
          return path.join(geoFileDir, subdir, p);
        }
        return p;
      };

      // 允许请求体直接传入（可选）
      const reqNuts = resolveDataPath((req.body as any).nuts_file, 'nuts3');
      const reqLau = resolveDataPath((req.body as any).lau_file, 'city');

      // 默认候选列表（使用新的地理数据目录）
      const nutsCandidates = [
        reqNuts,
        path.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.gpkg'),
        path.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.geojson'),
        path.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson')
      ].filter(Boolean) as string[];

      const lauCandidates = [
        reqLau,
        // 使用新位置的 LAU 数据源（优先）
        path.join(geoFileDir, 'city', 'LAU_2019.gpkg'),
        path.join(geoFileDir, 'city', 'LAU_2019.geojson')
      ].filter(Boolean) as string[];

      const findFirstExisting = (cands: string[]) => cands.find(p => fs.existsSync(p));
      const nuts_file = findFirstExisting(nutsCandidates);
      const lau_file = findFirstExisting(lauCandidates);

      // 阈值模式与网格参数（可选）
      // 阈值模式优先顺序：请求体 > 环境变量 DEFAULT_THRESHOLD_MODE > fixed
      const thresholdMode = ((req.body as any)?.threshold_mode as string | undefined) || (process.env.DEFAULT_THRESHOLD_MODE as string | undefined) || 'fixed'; // 'fixed' | 'grid'
      const gridRpForFilter = (req.body as any)?.grid_rp_for_filter as string | undefined; // '002y' | '005y' | '020y'
      const gridInterpMethod = (req.body as any)?.grid_interp_method as string | undefined; // 'nearest' | 'linear'

      // 网格阈值文件默认路径（基于 uploads 根目录）
      const { getUploadDir: getUploadDirForNc } = await import('./config');
      const uploadDirForNc = getUploadDirForNc();
      const uploadsRootForNc = path.dirname(uploadDirForNc);
      const thresholdDir = path.join(uploadsRootForNc, 'threshold_file');

      // 调用Python脚本
        const pyArgs: any = {
        input_file: inputFile,
        value_threshold: value_threshold || undefined,
        max_points: max_points,
        geojson_file: geojsonPath || undefined,
        take_max_per_polygon: take_max_per_polygon !== false,
        nuts_file,
        lau_file,
        ...buildGridThresholdArgs(thresholdMode, gridRpForFilter, gridInterpMethod, value_threshold, thresholdDir)
        };

        const result = await executePythonScriptJSON('interpolation.py', pyArgs, {
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

  // 查看表2（rain_flood_impact）数据
  app.get('/python/rain/impact/list', (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = (page - 1) * limit;
      const date = req.query.date as string;
      const province = req.query.province as string;
      const country = req.query.country as string;
      const level = req.query.level as string; // 整体级别筛选
      const rain_event_id = req.query.rain_event_id as string; // 事件ID筛选

      // 构建 WHERE 条件
      const where: string[] = [];
      const params: any = {};
      
      if (date) {
        where.push('time = @date');
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
      if (level) {
        const levelNum = parseInt(level);
        if (!isNaN(levelNum)) {
          where.push('level = @level');
          params.level = levelNum;
        }
      }
      if (rain_event_id) {
        where.push('rain_event_id = @rain_event_id');
        params.rain_event_id = rain_event_id;
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      
      // 查询总数
      const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM rain_flood_impact ${whereClause}`);
      const total = (where.length > 0 ? countStmt.get(params) : countStmt.get()) as any;
      
      // 查询数据
      const dataStmt = db.prepare(`
        SELECT 
          id, rain_event_id, time, level,
          country, province, city,
          transport_impact_level, economy_impact_level, safety_impact_level,
          timeline_data, source_count, detail_file,
          created_at, updated_at
        FROM rain_flood_impact 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
      `);
      params.limit = limit;
      params.offset = offset;
      const data = (where.length > 0 ? dataStmt.all(params) : dataStmt.all({ limit, offset })) as any[];

      // 解析 timeline_data JSON
      const parsedData = data.map(item => ({
        ...item,
        timeline_data: item.timeline_data ? JSON.parse(item.timeline_data) : null
      }));

      res.json({
        success: true,
        total: total?.count || 0,
        page,
        limit,
        totalPages: Math.ceil((total?.count || 0) / limit),
        data: parsedData
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || String(e)
      });
    }
  });

  // 调试：检查路径解析
  app.get('/python/debug/paths', async (_req: Request, res: Response) => {
    try {
      const { getPythonScriptDir, getGeoFileDir, getUploadDir, getOutputDir } = await import('./config');
      const scriptDir = getPythonScriptDir();
      const geoFileDir = getGeoFileDir();
      const uploadDir = getUploadDir();
      const outputDir = getOutputDir();
      const fs = await import('fs');
      const dataDir = path.join(scriptDir, 'data');
      const nuts3Dir = path.join(geoFileDir, 'nuts3');
      const cityDir = path.join(geoFileDir, 'city');
      
      // 列出各目录下的文件
      let dataFiles: string[] = [];
      let nuts3Files: string[] = [];
      let cityFiles: string[] = [];
      let uploadFiles: string[] = [];
      
      if (fs.existsSync(dataDir)) {
        dataFiles = fs.readdirSync(dataDir);
      }
      if (fs.existsSync(nuts3Dir)) {
        nuts3Files = fs.readdirSync(nuts3Dir);
      }
      if (fs.existsSync(cityDir)) {
        cityFiles = fs.readdirSync(cityDir);
      }
      if (fs.existsSync(uploadDir)) {
        uploadFiles = fs.readdirSync(uploadDir);
      }
      
      res.json({
        success: true,
        debug: {
          __dirname: __dirname,
          cwd: process.cwd(),
          scriptDir,
          scriptDirExists: fs.existsSync(scriptDir),
          dataDir,
          dataDirExists: fs.existsSync(dataDir),
          dataFiles: dataFiles.slice(0, 10),
          geoFileDir,
          geoFileDirExists: fs.existsSync(geoFileDir),
          nuts3Dir,
          nuts3DirExists: fs.existsSync(nuts3Dir),
          nuts3Files: nuts3Files.slice(0, 10),
          cityDir,
          cityDirExists: fs.existsSync(cityDir),
          cityFiles: cityFiles.slice(0, 10),
          uploadDir,
          uploadDirExists: fs.existsSync(uploadDir),
          uploadFiles: uploadFiles.slice(0, 20),
          outputDir,
          outputDirExists: fs.existsSync(outputDir),
          env: {
            UPLOAD_DIR: process.env.UPLOAD_DIR || '(not set)',
            PYTHON_SCRIPT_DIR: process.env.PYTHON_SCRIPT_DIR || '(not set)',
            GEO_FILE_DIR: process.env.GEO_FILE_DIR || '(not set)',
            OUTPUT_DIR: process.env.OUTPUT_DIR || '(not set)'
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
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
      
      // 构建文件路径（在新位置 apps/uploads/geofile/nuts3/ 目录下）
      const { getGeoFileDir } = await import('./config');
      const geoFileDir = getGeoFileDir();
      const geojsonPath = path.join(geoFileDir, 'nuts3', filename);
      
      console.log(`[GeoJSON] Request for: ${filename}`);
      console.log(`[GeoJSON] Geo file dir: ${geoFileDir}`);
      console.log(`[GeoJSON] Full path: ${geojsonPath}`);
      
      // 检查文件是否存在
      const fs = await import('fs');
      if (!fs.existsSync(geojsonPath)) {
        console.error(`[GeoJSON] File not found: ${geojsonPath}`);
        console.error(`[GeoJSON] Geo file dir exists: ${fs.existsSync(geoFileDir)}`);
        console.error(`[GeoJSON] NUTS3 dir exists: ${fs.existsSync(path.join(geoFileDir, 'nuts3'))}`);
        
        // 尝试列出 nuts3 目录下的文件
        const nuts3Dir = path.join(geoFileDir, 'nuts3');
        let availableFiles: string[] = [];
        if (fs.existsSync(nuts3Dir)) {
          availableFiles = fs.readdirSync(nuts3Dir);
        }
        
        return res.status(404).json({
          success: false,
          error: `GeoJSON file not found: ${filename}`,
          debug: {
            geoFileDir,
            geojsonPath,
            geoFileDirExists: fs.existsSync(geoFileDir),
            nuts3DirExists: fs.existsSync(nuts3Dir),
            availableFiles: availableFiles.slice(0, 10) // 只显示前10个文件
          }
        });
      }
      
      // 读取并返回GeoJSON文件
      console.log(`[GeoJSON] Reading file: ${geojsonPath}`);
      const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
      const geojsonData = JSON.parse(geojsonContent);
      
      res.json({
        success: true,
        data: geojsonData
      });
    } catch (error: any) {
      console.error(`[GeoJSON] Error reading file:`, error);
      res.status(500).json({
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  });
}

