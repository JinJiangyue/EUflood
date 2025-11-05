// Python模块路由
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { executePythonScript, executePythonScriptJSON } from './service';
import { checkPythonAvailable } from './utils/executor';
import { getRuntimeInfo } from './config';
import { uploadSingle, getFileInfo, cleanupFile } from './file-upload';
import path from 'path';

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
    console.log('[Interpolation] Received request:', req.body);
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
      
      // 调用Python脚本
      console.log(`[Interpolation] Calling interpolation.py with input: ${inputFile}`);
      console.log(`[Interpolation] Threshold: ${value_threshold || 'not set'}, Max points: ${max_points}`);
      console.log(`[Interpolation] GeoJSON: ${geojsonPath || 'not set'}`);
      
      const result = await executePythonScriptJSON('interpolation.py', {
        input_file: inputFile,
        value_threshold: value_threshold || undefined,
        max_points: max_points,
        geojson_file: geojsonPath || undefined,
        take_max_per_polygon: take_max_per_polygon !== false
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
        // 记录详细错误信息到控制台
        console.error(`[Interpolation] Error: ${result.error}`);
        console.error(`[Interpolation] Execution time: ${result.executionTime}ms`);
        
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

