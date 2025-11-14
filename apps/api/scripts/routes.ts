// Python模块路由
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { executePythonScript, executePythonScriptJSON } from './service';
import { checkPythonAvailable } from './utils/executor';
import { getRuntimeInfo } from './config';
import { uploadSingle, getFileInfo, cleanupFile } from './file-upload';
import path from 'path';
import fs from 'fs';
import { dbFind, dbGet, dbCount, dbCreate, dbCreateBatch } from '../src/db-helper';

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

/**
 * 查找第一个存在的文件路径
 */
function findFirstExisting(candidates: string[]): string | undefined {
  return candidates.find(p => fs.existsSync(p));
}

/**
 * 构建NUTS3文件候选列表
 */
function buildNutsCandidates(geoFileDir: string, reqNuts?: string): string[] {
  const candidates = [
    reqNuts,
    path.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.gpkg'),
    path.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.geojson'),
    path.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson')
  ];
  return candidates.filter(Boolean) as string[];
}

/**
 * 构建LAU文件候选列表
 */
function buildLauCandidates(geoFileDir: string, reqLau?: string): string[] {
  const candidates = [
    reqLau,
    path.join(geoFileDir, 'city', 'LAU_2019.gpkg'),
    path.join(geoFileDir, 'city', 'LAU_2019.geojson')
  ];
  return candidates.filter(Boolean) as string[];
}

/**
 * 解析数据文件路径（支持绝对路径和相对路径）
 */
function resolveDataPath(p: string | undefined, geoFileDir: string, subdir?: string): string | undefined {
  if (!p) return undefined;
  if (path.isAbsolute(p)) return p;
  if (subdir) {
    return path.join(geoFileDir, subdir, p);
  }
  return p;
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
    uploadSingle(req, res, async (err: any) => {
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
        const fileInfo = getFileInfo(req.file, process.cwd());
        console.log('[Upload] File uploaded successfully:', {
          originalname: req.file.originalname,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path,
          finalPath: fileInfo.path
        });
        console.log('[Upload] File saved to:', fileInfo.path);
        
        // 验证文件是否真的存在于指定路径
        const fs = await import('fs');
        if (!fs.existsSync(fileInfo.path)) {
          console.error('[Upload] WARNING: File not found at expected path:', fileInfo.path);
          console.error('[Upload] Actual file path from multer:', req.file.path);
          // 使用multer的实际路径
          fileInfo.path = req.file.path;
        }
        
        res.json({
          success: true,
          file: fileInfo,
          message: `File uploaded successfully to ${fileInfo.path}`
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

        // 默认域 GeoJSON（从新位置读取）
        let geojsonPath: string | undefined;
        const defaultGeo = path.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson');
        if (fs.existsSync(defaultGeo)) {
          geojsonPath = defaultGeo;
        }

        // 阈值网格（NC）默认目录：与 uploads 同级的 threshold_file
        const { getUploadDir } = await import('./config');
        const uploadDir = getUploadDir();
        const uploadsRoot = path.dirname(uploadDir);
        const thresholdDir = path.join(uploadsRoot, 'threshold_file');

        // NUTS/LAU 候选（优先请求体覆盖，其次默认，使用新位置）
        const reqNuts = resolveDataPath((req.body as any)?.nuts_file, geoFileDir, 'nuts3');
        const reqLau = resolveDataPath((req.body as any)?.lau_file, geoFileDir, 'city');
        const nuts_file = findFirstExisting(buildNutsCandidates(geoFileDir, reqNuts));
        const lau_file = findFirstExisting(buildLauCandidates(geoFileDir, reqLau));

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
          // 不再删除文件，保留原始文件
          // cleanupFile(inputFile);
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

        // 批量写入 rain_event（应用层计算 seq 与 rain_event_id）
        // 使用 PocketBase 批量创建

        // 计算每个 (date, province) 的起始 seq（保留旧记录，避免覆盖已搜索的数据）
        // 统一使用字符串格式 "2025-10-11"
        const dateStr = String(confirmedDate); // "2025-10-11"
        const ymd = dateStr.replace(/-/g, '');
        
        // 计算日期范围（用于查询）：使用日期范围查询以兼容不同的日期存储格式
        const dateStart = new Date(dateStr + 'T00:00:00.000Z').toISOString();
        const dateEnd = new Date(dateStr + 'T23:59:59.999Z').toISOString();
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
        // 先统计各省份数量，查询现有 max seq，只查一次
        const provinceToCount = new Map<string, number>();
        for (const p of points) {
          const province = getProvinceName(p.province_name || 'UNKNOWN');
          provinceToCount.set(province, (provinceToCount.get(province) || 0) + 1);
        }
        
        // 查询现有记录以获取最大 seq
        // 使用日期范围查询，匹配 ISO 8601 格式的日期
        const provinceToNextSeq = new Map<string, number>();
        for (const [province] of provinceToCount) {
          // 查询该日期和省份的所有记录
          const existingRecords = await dbFind('rain_event', {
            filter: `date >= "${dateStart}" && date <= "${dateEnd}" && province = "${province}"`,
            sort: '-seq',
            limit: 1
          });
          const maxSeq = existingRecords.length > 0 ? (existingRecords[0].seq || 0) : 0;
          provinceToNextSeq.set(province, maxSeq + 1);
        }

        // 批量查询已存在的记录（优化性能）
        // 构建查询条件：查询该日期和文件名的所有记录
        const fileName = req.file!.originalname;
        
        // 使用日期范围查询 + 文件名精确匹配
        const dateFilter = `date >= "${dateStart}" && date <= "${dateEnd}"`;
        const filterStr = `${dateFilter} && file_name = "${fileName}"`;
        
        const existingRecords = await dbFind('rain_event', {
          filter: filterStr,
          limit: 10000
        });
        
        console.log(`[去重检查] 查询到 ${existingRecords.length} 条已存在记录（日期: ${dateStr}, 文件: ${fileName}）`);
        
        // 构建已存在记录的 Set（用于快速查找）
        // 使用 "date|file_name|longitude|latitude" 作为唯一键
        // 注意：处理浮点数精度问题，保留6位小数
        // 注意：统一日期格式为 YYYY-MM-DD，避免格式不一致导致去重失败
        const normalizeCoord = (coord: number | string | null | undefined): string => {
          if (coord === null || coord === undefined) return 'null';
          const num = typeof coord === 'string' ? parseFloat(coord) : coord;
          if (isNaN(num)) return 'null';
          // 保留6位小数，避免浮点数精度问题
          return num.toFixed(6);
        };
        
        // 标准化日期格式为 YYYY-MM-DD
        const normalizeDate = (date: string | Date | null | undefined): string => {
          if (!date) return '';
          try {
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            return dateObj.toISOString().split('T')[0]; // 返回 YYYY-MM-DD 格式
          } catch {
            return String(date).split('T')[0]; // 如果解析失败，尝试直接分割
          }
        };
        
        const existingKeys = new Set<string>();
        for (const record of existingRecords) {
          // 确保字段名正确（PocketBase 使用下划线命名）
          const date = record.date;
          const fileName = record.file_name;
          const lon = record.longitude;
          const lat = record.latitude;
          
          // 标准化日期、坐标和文件名
          const dateNorm = normalizeDate(date);
          const lonNorm = normalizeCoord(lon);
          const latNorm = normalizeCoord(lat);
          const key = `${dateNorm}|${fileName}|${lonNorm}|${latNorm}`;
          existingKeys.add(key);
        }
        
        console.log(`[去重检查] 构建了 ${existingKeys.size} 个唯一键用于去重检查`);

        // 生成行（带 id/seq），跳过已存在的记录（保留已搜索的数据）
        const rows: any[] = [];
        let skippedCount = 0;
        for (const p of points) {
          const province = getProvinceName(p.province_name || 'UNKNOWN'); // 用于存储到数据库
          const provinceForId = getProvinceForId(p.province_name || 'UNKNOWN'); // 用于生成 ID
          const lon = Number(p.longitude);
          const lat = Number(p.latitude);
          
          // 检查是否已存在相同记录（date + file_name + longitude + latitude）
          // 使用相同的精度处理和日期格式
          const dateNorm = normalizeDate(dateStr); // 确保日期格式一致
          const lonNorm = normalizeCoord(lon);
          const latNorm = normalizeCoord(lat);
          const key = `${dateNorm}|${req.file!.originalname}|${lonNorm}|${latNorm}`;
          
          if (existingKeys.has(key)) {
            // 已存在，跳过（保留旧记录，包括 searched 状态）
            skippedCount++;
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

          rows.push({
            rain_event_id: id,
            date: dateStr, // 统一使用字符串格式 "2025-10-11"
            country: p.country_name ?? null,
            province, // 存储保留空格的版本
            city: p.city_name ?? null,
            longitude: lon,
            latitude: lat,
            value: p.value != null ? Number(p.value) : null,
            threshold: rowThreshold,
            return_period_band: band,
            file_name: req.file!.originalname,
            seq,
            searched: 0
          });
        }

        // 批量创建记录
        let insertedCount = 0;
        let errorCount = 0;
        if (rows.length > 0) {
          try {
            // 再次检查 rain_event_id 是否已存在（防止并发冲突）
            // 批量查询所有可能的 rain_event_id
            const idsToCheck = rows.map(row => row.rain_event_id);
            const existingIds = new Set<string>();
            
            // 批量查询：检查 rain_event_id 是否已存在（防止并发冲突）
            if (idsToCheck.length > 0) {
              try {
                // PocketBase 的 OR 查询语法：field = "value1" || field = "value2" || ...
                // 如果 ID 太多，分批查询（每批最多 50 个）
                const batchSize = 50;
                for (let i = 0; i < idsToCheck.length; i += batchSize) {
                  const batch = idsToCheck.slice(i, i + batchSize);
                  const orConditions = batch.map(id => `rain_event_id = "${id}"`).join(' || ');
                  const existingRecords = await dbFind('rain_event', {
                    filter: orConditions,
                    limit: batch.length
                  });
                  
                  for (const record of existingRecords) {
                    if (record.rain_event_id) {
                      existingIds.add(record.rain_event_id);
                    }
                  }
                }
              } catch (e: any) {
                // 如果批量查询失败，记录警告但继续（createBatch 会处理重复错误）
                console.warn(`[入库] 批量查询 rain_event_id 失败，将在插入时处理重复:`, e.message);
              }
            }
            
            // 过滤掉已存在的 ID
            const rowsToInsert = rows.filter(row => !existingIds.has(row.rain_event_id));
            if (existingIds.size > 0) {
              console.log(`[入库] 检测到 ${existingIds.size} 个已存在的 rain_event_id，将跳过`);
            }
            
            if (rowsToInsert.length > 0) {
              const created = await dbCreateBatch('rain_event', rowsToInsert);
              insertedCount = created.length;
              errorCount = rowsToInsert.length - created.length;
            } else {
              console.log(`[入库] 所有记录的 rain_event_id 都已存在，跳过插入`);
            }
            
            console.log(`[入库] 成功插入 ${insertedCount} 条新记录，跳过 ${skippedCount} 条重复记录，${errorCount} 条失败`);
          } catch (error: any) {
            console.error(`[入库] 批量创建失败:`, error.message);
            errorCount = rows.length;
            // 不抛出错误，继续返回结果，避免程序崩溃
          }
        } else {
          console.log(`[入库] 所有记录都已存在，跳过 ${skippedCount} 条重复记录`);
        }
        
        // 不再删除文件，保留原始文件以便后续查询
        // cleanupFile(inputFile);
        // 返回入库结果和插值数据（用于前端显示）
        // data 是 Python 返回的整个对象：{ success: true, summary: {...}, points: [...] }
        return res.json({ 
          success: true, 
          inserted: insertedCount,
          skipped: skippedCount,
          errors: errorCount,
          total: points.length,
          data: data // 返回插值结果，包含 points 和 summary
        });
      } catch (e: any) {
        console.error(`[入库] 处理失败:`, e);
        return res.status(500).json({ 
          success: false, 
          error: e?.message || String(e),
          stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
        });
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
      // 允许请求体直接传入（可选）
      const reqNuts = resolveDataPath((req.body as any).nuts_file, geoFileDir, 'nuts3');
      const reqLau = resolveDataPath((req.body as any).lau_file, geoFileDir, 'city');

      // 默认候选列表（使用新的地理数据目录）
      const nuts_file = findFirstExisting(buildNutsCandidates(geoFileDir, reqNuts));
      const lau_file = findFirstExisting(buildLauCandidates(geoFileDir, reqLau));

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
  app.get('/python/rain/stats', async (_req: Request, res: Response) => {
    try {
      const total = await dbCount('rain_event');
      
      // 获取所有记录进行分组统计
      const allRecords = await dbFind('rain_event', {
        sort: '-date',
        limit: 10000 // 获取足够多的记录用于统计
      });
      
      // 按日期分组
      const dateMap = new Map<string, number>();
      for (const record of allRecords) {
        const date = record.date;
        dateMap.set(date, (dateMap.get(date) || 0) + 1);
      }
      const byDate = Array.from(dateMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);
      
      // 按省份分组
      const provinceMap = new Map<string, number>();
      for (const record of allRecords) {
        const province = record.province || 'UNKNOWN';
        provinceMap.set(province, (provinceMap.get(province) || 0) + 1);
      }
      const byProvince = Array.from(provinceMap.entries())
        .map(([province, count]) => ({ province, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      res.json({
        success: true,
        total,
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
  app.get('/python/rain/list', async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = (page - 1) * limit;
      const date = req.query.date as string;
      const province = req.query.province as string;
      const country = req.query.country as string;

      // 构建 PocketBase 过滤器
      const filters: string[] = [];
      if (date) {
        filters.push(`date = "${date}"`);
      }
      if (province) {
        filters.push(`province = "${province}"`);
      }
      if (country) {
        filters.push(`country = "${country}"`);
      }
      const filter = filters.length > 0 ? filters.join(' && ') : undefined;
      
      // 查询总数
      const total = await dbCount('rain_event', filter);
      
      // 查询数据
      const data = await dbFind('rain_event', {
        filter,
        sort: '-date,seq',
        limit,
        offset
      });

      res.json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        error: e?.message || String(e)
      });
    }
  });

  // 根据地址和时间查询NUTS3区域内的降雨点
  app.post('/python/rain/query-by-location', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        address: z.string().min(1, 'Address is required'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
        value_threshold: z.number().optional(),
        threshold_mode: z.enum(['grid', 'fixed']).optional().default('grid')
      });
      
      const { address, date, value_threshold, threshold_mode } = schema.parse(req.body);
      
      // 默认阈值设为50
      const finalThreshold = value_threshold !== undefined ? value_threshold : 50;
      
      // 1. 地理编码：将地址转换为坐标
      let lat: number, lon: number;
      try {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const geocodeRes = await fetch(geocodeUrl, {
          headers: {
            'User-Agent': 'EUFlood/1.0'
          }
        });
        
        if (!geocodeRes.ok) {
          throw new Error('Geocoding service unavailable');
        }
        
        const geocodeData = await geocodeRes.json();
        if (!geocodeData || geocodeData.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Address not found. Please provide a more specific address.'
          });
        }
        
        lat = parseFloat(geocodeData[0].lat);
        lon = parseFloat(geocodeData[0].lon);
      } catch (error: any) {
        return res.status(500).json({
          success: false,
          error: `Geocoding failed: ${error.message}`
        });
      }
      
      // 2. 根据日期查找对应的txt文件（从上传目录中查找，支持年月文件夹）
      const { getUploadDir } = await import('./config');
      const uploadDir = getUploadDir();
      const fs = await import('fs');
      
      // 将日期格式从 YYYY-MM-DD 转换为年月文件夹格式（如 202410）
      const dateParts = date.split('-');
      const yearMonth = dateParts[0] + dateParts[1]; // YYYYMM
      const dateStr = dateParts.join(''); // YYYYMMDD
      
      // 先尝试在年月文件夹中查找
      const yearMonthDir = path.join(uploadDir, yearMonth);
      let matchingFiles: string[] = [];
      
      if (fs.existsSync(yearMonthDir) && fs.statSync(yearMonthDir).isDirectory()) {
        // 在年月文件夹中查找
        const files = fs.readdirSync(yearMonthDir);
        matchingFiles = files.filter(f => {
          const lower = f.toLowerCase();
          return (lower.includes(dateStr) || lower.includes(dateParts[2])) && 
                 (lower.endsWith('.txt') || lower.endsWith('.csv'));
        }).map(f => path.join(yearMonthDir, f));
      }
      
      // 如果年月文件夹中没找到，在根目录查找（兼容旧文件）
      if (matchingFiles.length === 0) {
        const files = fs.readdirSync(uploadDir);
        const rootFiles = files.filter(f => {
          const filePath = path.join(uploadDir, f);
          // 跳过子目录
          if (fs.statSync(filePath).isDirectory()) return false;
          const lower = f.toLowerCase();
          return (lower.includes(dateStr) || lower.includes(dateParts[2])) && 
                 (lower.endsWith('.txt') || lower.endsWith('.csv'));
        });
        matchingFiles = rootFiles.map(f => path.join(uploadDir, f));
      }
      
      if (matchingFiles.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No file found for date ${date}. Please upload the file first.`
        });
      }
      
      // 使用第一个匹配的文件（已经是完整路径）
      const inputFile = matchingFiles[0];
      const filename = path.basename(inputFile);
      
      // 3. 根据坐标找到NUTS3区域（使用Python脚本查找）
      const { getGeoFileDir } = await import('./config');
      const geoFileDir = getGeoFileDir();
      
      // 查找NUTS3数据文件
      const nutsFile = findFirstExisting(buildNutsCandidates(geoFileDir));
      
      if (!nutsFile) {
        return res.status(500).json({
          success: false,
          error: 'NUTS3 data file not found. Please ensure NUTS3 data is available.'
        });
      }
      
      // 调用Python脚本查找NUTS3区域
      const findNuts3Result = await executePythonScriptJSON('find_nuts3.py', {
        lon,
        lat,
        nuts_file: nutsFile
      }, { timeout: 30000 });
      
      if (!findNuts3Result.success || !findNuts3Result.data?.success) {
        return res.status(404).json({
          success: false,
          error: findNuts3Result.data?.error || findNuts3Result.error || 'Failed to find NUTS3 region for the given location.'
        });
      }
      
      const nuts3GeoJSON = findNuts3Result.data.geojson;
      const nuts3Properties = findNuts3Result.data.properties;
      
      // 将NUTS3区域GeoJSON写入临时文件
      const tempGeoJSONPath = path.join(uploadDir, `temp_nuts3_${Date.now()}.geojson`);
      fs.writeFileSync(tempGeoJSONPath, JSON.stringify(nuts3GeoJSON));
      
      try {
        // 4. 调用interpolation接口，使用NUTS3区域作为过滤条件
        const lauFile = findFirstExisting(buildLauCandidates(geoFileDir));
        
        const pyArgs: any = {
          input_file: inputFile,
          value_threshold: finalThreshold,
          max_points: 10000,
          geojson_file: tempGeoJSONPath,
          take_max_per_polygon: false, // 返回所有点，不取最大值
          threshold_mode: threshold_mode || 'grid',
          grid_rp_for_filter: '005y',
          grid_interp_method: 'nearest',
          nuts_file: nutsFile,
          lau_file: lauFile
        };
        
        const result = await executePythonScriptJSON('interpolation.py', pyArgs, {
          timeout: 120000
        });
        
        // 清理临时文件
        if (fs.existsSync(tempGeoJSONPath)) {
          fs.unlinkSync(tempGeoJSONPath);
        }
        
        if (result.success) {
          res.json({
            success: true,
            data: result.data,
            location: { 
              lat, 
              lon, 
              address,
              nuts3: nuts3Properties?.NUTS_NAME || nuts3Properties?.NAME || 'Unknown'
            },
            date,
            filename,
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
        // 清理临时文件
        if (fs.existsSync(tempGeoJSONPath)) {
          fs.unlinkSync(tempGeoJSONPath);
        }
        throw error;
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

  // 查看表2（rain_flood_impact）数据
  app.get('/python/rain/impact/list', async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = (page - 1) * limit;
      const date = req.query.date as string;
      const province = req.query.province as string;
      const country = req.query.country as string;
      const level = req.query.level as string; // 整体级别筛选
      const rain_event_id = req.query.rain_event_id as string; // 事件ID筛选

      // 构建 PocketBase 过滤器
      const filters: string[] = [];
      if (date) {
        filters.push(`date = "${date}"`);
      }
      if (province) {
        filters.push(`province = "${province}"`);
      }
      if (country) {
        filters.push(`country = "${country}"`);
      }
      if (level) {
        const levelNum = parseInt(level);
        if (!isNaN(levelNum)) {
          filters.push(`level = ${levelNum}`);
        }
      }
      if (rain_event_id) {
        filters.push(`rain_event_id = "${rain_event_id}"`);
      }
      const filter = filters.length > 0 ? filters.join(' && ') : undefined;
      
      // 查询总数
      const total = await dbCount('rain_flood_impact', filter);
      
      // 查询数据
      const data = await dbFind('rain_flood_impact', {
        filter,
        sort: '-created',
        limit,
        offset
      });

      // 解析 timeline_data JSON
      const parsedData = data.map(item => ({
        ...item,
        timeline_data: item.timeline_data ? (typeof item.timeline_data === 'string' ? JSON.parse(item.timeline_data) : item.timeline_data) : null
      }));

      res.json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
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

