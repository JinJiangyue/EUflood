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
          COUNT(CASE WHEN searched = 2 THEN 1 END) as need_research_count,
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
          COUNT(CASE WHEN searched = 0 THEN 1 END) as total_unsearched,
          COUNT(CASE WHEN searched = 2 THEN 1 END) as total_need_research
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
          totalUnsearched: stats.total_unsearched || 0,
          totalNeedResearch: stats.total_need_research || 0
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
  // 判断逻辑：如果表2中有对应ID，返回表2数据（已搜索）；否则返回表1数据（未搜索）
  app.get('/events/rain/:id', async (req: Request, res: Response) => {
    try {
      // 解码URL参数（处理特殊字符）
      const id = decodeURIComponent(req.params.id);
      
      // 先检查表2中是否有对应记录
      const impact = db.prepare('SELECT * FROM rain_flood_impact WHERE rain_event_id = ?').get(id) as any;
      
      if (impact) {
        // 表2有数据，表示已搜索，返回表2数据
        // 解析 timeline_data JSON
        let timelineData = null;
        if (impact.timeline_data) {
          try {
            timelineData = typeof impact.timeline_data === 'string' 
              ? JSON.parse(impact.timeline_data) 
              : impact.timeline_data;
          } catch (e) {
            timelineData = null;
          }
        }
        
        return res.json({
          success: true,
          searched: true, // 标记为已搜索
          event: {
            // 表2的字段
            id: impact.id,
            rain_event_id: impact.rain_event_id,
            time: impact.time,
            level: impact.level,
            country: impact.country,
            province: impact.province,
            city: impact.city,
            transport_impact_level: impact.transport_impact_level,
            economy_impact_level: impact.economy_impact_level,
            safety_impact_level: impact.safety_impact_level,
            timeline_data: timelineData,
            source_count: impact.source_count,
            detail_file: impact.detail_file,
            created_at: impact.created_at,
            updated_at: impact.updated_at
          }
        });
      } else {
        // 表2没有数据，表示未搜索，返回表1数据
        const event = db.prepare('SELECT * FROM rain_event WHERE id = ?').get(id) as any;
        
        if (!event) {
          return res.status(404).json({ 
            success: false,
            error: '事件未找到' 
          });
        }
        
        return res.json({
          success: true,
          searched: event.searched === 1, // 向后兼容：布尔值
          event: {
            ...event,
            searched: event.searched || 0, // 返回数值：0=未搜索，1=已搜索，2=需重搜
            searchedText: event.searched === 1 ? '已搜索' : (event.searched === 2 ? '需重搜' : '未搜索')
          }
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });
  
  // 更新搜索状态（保留用于向后兼容）
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
  
  // 触发深度搜索（调用Python搜索工作流）
  app.post('/events/rain/:id/deep-search', async (req: Request, res: Response) => {
    try {
      // 解码URL参数（处理特殊字符）
      const id = decodeURIComponent(req.params.id);
      console.log(`[深度搜索] 收到请求，事件ID: ${id}`);
      
      // 检查事件是否存在
      const event = db.prepare('SELECT * FROM rain_event WHERE id = ?').get(id) as any;
      if (!event) {
        console.log(`[深度搜索] 事件未找到: ${id}`);
        return res.status(404).json({ 
          success: false,
          error: '事件未找到' 
        });
      }
      
      // 检查是否已经搜索过（表2中是否有记录）
      const existingImpact = db.prepare('SELECT * FROM rain_flood_impact WHERE rain_event_id = ?').get(id) as any;
      if (existingImpact) {
        console.log(`[深度搜索] 事件已搜索过: ${id}`);
        return res.json({
          success: true,
          message: '该事件已经进行过深度搜索',
          already_searched: true
        });
      }
      
      console.log(`[深度搜索] 开始处理事件: ${id}`);
      
      // 调用Python搜索工作流
      // 使用Promise包装异步的spawn操作
      return new Promise<void>((resolve, reject) => {
        try {
          console.log(`[深度搜索] ========== 开始处理深度搜索请求 ==========`);
          console.log(`[深度搜索] 事件ID: ${id}`);
          
          const { spawn } = require('child_process');
          const path = require('path');
          const fs = require('fs');
          
          // 查找Python脚本路径 - 使用类似 config.ts 的方法
          // 方法1：从 process.cwd() 查找（最可靠，因为通常从 apps/api 目录启动）
          const cwd = process.cwd();
          console.log(`[深度搜索] 当前工作目录 (cwd): ${cwd}`);
          let projectRoot: string | null = null;
          
          // 从 cwd 向上查找，直到找到包含 'search' 目录的目录（项目根目录）
          let currentDir = cwd;
          for (let i = 0; i < 6; i++) {
            const searchDir = path.join(currentDir, 'search');
            if (fs.existsSync(searchDir)) {
              projectRoot = currentDir;
              break;
            }
            const parent = path.dirname(currentDir);
            if (parent === currentDir) break;
            currentDir = parent;
          }
          
          // 方法2：从 __dirname 查找（编译后指向 dist/modules/events）
          if (!projectRoot) {
            let currentDir = __dirname;
            for (let i = 0; i < 8; i++) {
              const searchDir = path.join(currentDir, 'search');
              if (fs.existsSync(searchDir)) {
                projectRoot = currentDir;
                break;
              }
              const parent = path.dirname(currentDir);
              if (parent === currentDir) break;
              currentDir = parent;
            }
          }
          
          // 方法3：回退方案 - 从 __dirname 直接计算
          if (!projectRoot) {
            if (__dirname.includes('dist')) {
              // 编译后：dist/modules/events -> 向上5级到项目根目录
              projectRoot = path.resolve(__dirname, '../../../../..');
            } else {
              // 开发环境：src/modules/events -> 向上4级到项目根目录
              projectRoot = path.resolve(__dirname, '../../../..');
            }
          }
          
          // 验证项目根目录（检查是否存在 search 目录）
          console.log(`[深度搜索] 找到项目根目录: ${projectRoot}`);
          const searchDir = path.join(projectRoot, 'search');
          if (!fs.existsSync(searchDir)) {
            const errorMsg = `无法找到项目根目录。尝试的路径: ${projectRoot} (cwd: ${cwd}, __dirname: ${__dirname})`;
            console.error(`[深度搜索] ${errorMsg}`);
            res.status(500).json({
              success: false,
              error: errorMsg
            });
            resolve();
            return;
          }
          console.log(`[深度搜索] 验证项目根目录成功: ${projectRoot}`);
          
          // 此时 projectRoot 已经验证过，确保是 string 类型
          if (!projectRoot) {
            const errorMsg = `项目根目录未找到 (cwd: ${cwd}, __dirname: ${__dirname})`;
            console.error(`[深度搜索] ${errorMsg}`);
            res.status(500).json({
              success: false,
              error: errorMsg
            });
            resolve();
            return;
          }
          
          // 搜索脚本：apps/api/scripts/deep_search.py
          const searchScript = path.join(projectRoot, 'apps', 'api', 'scripts', 'deep_search.py');
          console.log(`[深度搜索] 检查搜索脚本: ${searchScript}`);
          
          if (!fs.existsSync(searchScript)) {
            const errorMsg = `搜索脚本未找到: ${searchScript} (项目根目录: ${projectRoot})`;
            console.error(`[深度搜索] ${errorMsg}`);
            res.status(500).json({
              success: false,
              error: errorMsg
            });
            resolve();
            return;
          }
          console.log(`[深度搜索] 搜索脚本存在: ${searchScript}`);
          
          // 优先使用嵌入式Python，否则使用系统Python
          const pythonEmbedPath = path.join(projectRoot, 'apps', 'api', 'python-embed', 'python.exe');
          const pythonExec = fs.existsSync(pythonEmbedPath) ? pythonEmbedPath : (process.env.PYTHON_EXEC || 'python');
          
          // 将事件数据转换为JSON格式，并保存到临时文件（与用户手动运行方式完全一致）
          const eventData = {
            id: event.id,
            date: event.date,
            country: event.country,
            province: event.province,
            city: event.city,
            longitude: event.longitude,
            latitude: event.latitude,
            value: event.value,
            threshold: event.threshold,
            file_name: event.file_name,
            seq: event.seq,
            searched: event.searched
          };
          
          // 创建临时JSON文件（在项目根目录，文件名格式：temp_event_事件ID.json）
          // 例如：temp_event_20251011_Menorca_1.json
          const safeId = id.replace(/[^a-zA-Z0-9_]/g, '_');
          const tempJsonFile = path.join(projectRoot, `temp_event_${safeId}.json`);
          
          console.log(`[深度搜索] 创建临时JSON文件: ${tempJsonFile}`);
          console.log(`[深度搜索] 事件数据:`, JSON.stringify(eventData, null, 2));
          
          // 写入JSON文件（格式与test_event.json完全一致）
          fs.writeFileSync(tempJsonFile, JSON.stringify(eventData, null, 2), 'utf-8');
          
          // 验证文件是否创建成功
          if (!fs.existsSync(tempJsonFile)) {
            throw new Error(`无法创建临时JSON文件: ${tempJsonFile}`);
          }
          console.log(`[深度搜索] 临时JSON文件创建成功`);
          
          // 执行搜索脚本（与用户手动运行方式完全一致）
          // 命令：.\apps\api\python-embed\python.exe apps\api\scripts\deep_search.py --json temp_event_xxx.json
          const scriptRelativePath = path.relative(projectRoot, searchScript);
          const jsonRelativePath = path.relative(projectRoot, tempJsonFile);
          
          console.log(`[深度搜索] Python执行路径: ${pythonExec}`);
          console.log(`[深度搜索] 脚本路径: ${scriptRelativePath}`);
          console.log(`[深度搜索] JSON文件路径: ${jsonRelativePath}`);
          console.log(`[深度搜索] 工作目录: ${projectRoot}`);
          
          // 设置环境变量，确保Python输出使用UTF-8编码
          // 重要：传递所有环境变量（包括 .env 中的 API Keys）
          // 注意：projectRoot 此时已经验证过，确保是 string 类型
          // 重要：过滤掉占位符值，避免覆盖 .env 文件中的真实值
          const env: NodeJS.ProcessEnv = {
            ...process.env,  // 包含所有现有环境变量（包括从 .env 加载的）
            PYTHONPATH: projectRoot || undefined,  // 确保不是 null
            PYTHONIOENCODING: 'utf-8',  // 强制Python使用UTF-8编码
            PYTHONUTF8: '1'  // Python 3.7+ 启用UTF-8模式
          };
          
          // 过滤占位符值：如果环境变量是占位符，删除它，让 Python 从 .env 文件读取真实值
          const placeholderPatterns = [
            'your_tavily_api_key_here',
            'your_thenewsapi_key_here',
            'your_openai_api_key_here',
            'your_gemini_api_key_here',
            'your_youtube_api_key_here'
          ];
          
          for (const key in env) {
            const value = env[key];
            if (typeof value === 'string' && placeholderPatterns.some(pattern => value.includes(pattern))) {
              // 删除占位符值，让 Python 从 .env 文件读取
              delete env[key];
              console.log(`[深度搜索] 过滤占位符环境变量: ${key}`);
            }
          }
          
          // 检查关键环境变量是否传递
          console.log(`[深度搜索] 环境变量检查:`);
          const tavilyKey = env.TAVILY_API_KEY;
          const thenewsapiKey = env.THENEWSAPI_KEY;
          const openaiKey = env.OPENAI_API_KEY;
          const geminiKey = env.GEMINI_API_KEY;
          const dbFile = env.DB_FILE;
          
          console.log(`[深度搜索]   TAVILY_API_KEY: ${tavilyKey ? '已设置（长度: ' + tavilyKey.length + '）' : '未设置'}`);
          console.log(`[深度搜索]   THENEWSAPI_KEY: ${thenewsapiKey ? '已设置（长度: ' + thenewsapiKey.length + '）' : '未设置'}`);
          console.log(`[深度搜索]   OPENAI_API_KEY: ${openaiKey ? '已设置（长度: ' + openaiKey.length + '）' : '未设置'}`);
          console.log(`[深度搜索]   GEMINI_API_KEY: ${geminiKey ? '已设置（长度: ' + geminiKey.length + '）' : '未设置'}`);
          console.log(`[深度搜索]   DB_FILE: ${dbFile || '未设置'}`);
          
          const pythonProcess = spawn(pythonExec, [searchScript, '--json', tempJsonFile], {
            cwd: projectRoot,  // 工作目录设置为项目根目录
            stdio: ['ignore', 'pipe', 'pipe'],
            env: env
          });
          
          console.log(`[深度搜索] Python进程已启动，PID: ${pythonProcess.pid}`);
          
          // 清理临时文件（在进程完成后）
          pythonProcess.on('close', (code: number) => {
            console.log(`[深度搜索] Python进程完成，退出码: ${code}`);
            try {
              if (fs.existsSync(tempJsonFile)) {
                fs.unlinkSync(tempJsonFile);
                console.log(`[深度搜索] 临时文件已清理: ${tempJsonFile}`);
              }
            } catch (e) {
              console.error(`[深度搜索] 清理临时文件失败:`, e);
            }
          });
          
          let stdout = '';
          let stderr = '';
          let responseSent = false;
          
          const sendResponse = (success: boolean, message: string, data?: any) => {
            if (responseSent) {
              console.log(`[深度搜索] 响应已发送，忽略重复响应`);
              return;
            }
            responseSent = true;
            console.log(`[深度搜索] 发送响应: success=${success}, message=${message}`);
            
            // 确保响应头设置UTF-8编码
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            
            if (success) {
              const responseData = {
                success: true,
                message,
                event_id: id,
                ...data
              };
              console.log(`[深度搜索] 响应数据:`, JSON.stringify(responseData, null, 2));
              res.json(responseData);
            } else {
              console.error(`[深度搜索] 错误响应:`, message, data);
              const errorData = {
                success: false,
                error: message,
                ...data
              };
              console.error(`[深度搜索] 错误响应数据:`, JSON.stringify(errorData, null, 2));
              res.status(500).json(errorData);
            }
            resolve();
          };
          
          pythonProcess.stdout.on('data', (data: Buffer) => {
            // 使用UTF-8解码，确保中文正确显示
            const text = data.toString('utf-8');
            stdout += text;
            console.log(`[深度搜索] Python stdout:`, text.substring(0, 200)); // 只输出前200字符
          });
          
          pythonProcess.stderr.on('data', (data: Buffer) => {
            // 使用UTF-8解码，确保中文正确显示
            const text = data.toString('utf-8');
            stderr += text;
            console.error(`[深度搜索] Python stderr:`, text.substring(0, 200)); // 只输出前200字符
          });
          
          pythonProcess.on('close', (code: number) => {
            console.log(`[深度搜索] Python进程关闭，退出码: ${code}, stdout长度: ${stdout.length}, stderr长度: ${stderr.length}`);
            if (responseSent) {
              console.log(`[深度搜索] 响应已发送，忽略close事件`);
              return;
            }
            
            if (code === 0) {
              console.log(`[深度搜索] Python进程成功完成，开始检查表2数据`);
              // Python进程已完成，使用轮询方式检查表2数据（最多等待10秒）
              // 因为搜索可能需要30秒-1分钟，进程完成后数据库写入通常很快
              let checkCount = 0;
              const maxChecks = 10; // 最多检查10次
              const checkInterval = 1000; // 每次间隔1秒
              
              const checkTable2 = () => {
                console.log(`[深度搜索] 检查表2数据 (第${checkCount + 1}次)`);
                const impact = db.prepare('SELECT * FROM rain_flood_impact WHERE rain_event_id = ?').get(id) as any;
                if (impact) {
                  console.log(`[深度搜索] ✅ 找到表2数据:`, impact);
                  
                  // 更新表1的searched字段为1（已搜索）
                  try {
                    const updateSearched = db.prepare('UPDATE rain_event SET searched = 1 WHERE id = ?');
                    const updateResult = updateSearched.run(id);
                    if (updateResult.changes > 0) {
                      console.log(`[深度搜索] ✅ 已更新表1的searched字段为1: ${id}`);
                    } else {
                      console.warn(`[深度搜索] ⚠️ 更新表1的searched字段失败（可能事件不存在）: ${id}`);
                    }
                  } catch (updateError) {
                    console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
                    // 不中断流程，继续返回成功响应
                  }
                  
                  sendResponse(true, '深度搜索完成，已生成影响评估报告和表2数据');
                } else {
                  checkCount++;
                  console.log(`[深度搜索] 未找到表2数据，已检查${checkCount}次，最多${maxChecks}次`);
                  if (checkCount < maxChecks) {
                    // 继续等待并重试
                    setTimeout(checkTable2, checkInterval);
                  } else {
                    // 超过最大等待时间，检查是否有错误日志
                    console.log(`[深度搜索] 超过最大等待时间，分析stderr内容...`);
                    console.log(`[深度搜索] stderr前500字符:`, stderr.substring(0, 500));
                    console.log(`[深度搜索] stderr后500字符:`, stderr.substring(Math.max(0, stderr.length - 500)));
                    
                    const hasError = stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('exception');
                    const hasTable2Success = stdout.includes('表2数据填充成功') || stderr.includes('表2数据填充成功') || stderr.includes('✅ 表2数据已填充');
                    const hasTable2Fail = stdout.includes('表2数据填充失败') || stderr.includes('表2数据填充失败') || stderr.includes('填充表2数据失败');
                    const hasLLMError = stdout.includes('LLM') && (stdout.includes('失败') || stdout.includes('error') || stderr.includes('LLM') && (stderr.includes('失败') || stderr.includes('error')));
                    
                    // 提取关键错误信息
                    let errorSummary = '深度搜索执行完成，但未找到生成的表2数据。\n\n可能原因：\n';
                    if (hasTable2Fail) {
                      errorSummary += '❌ 表2数据填充失败（检查数据库写入）\n';
                    } else if (hasLLMError) {
                      errorSummary += '❌ LLM处理失败（检查API配置）\n';
                    } else if (!hasTable2Success && !hasTable2Fail) {
                      errorSummary += '⚠️ 未看到表2填充日志（可能未执行到填充步骤）\n';
                    } else {
                      errorSummary += '⚠️ 数据库写入可能延迟或失败\n';
                    }
                    
                    // 提取stderr中的关键信息
                    const stderrLines = stderr.split('\n');
                    const table2RelatedLines = stderrLines.filter(line => 
                      line.includes('表2') || 
                      line.includes('rain_flood_impact') || 
                      line.includes('fill_rain_flood_impact') ||
                      line.includes('db_writer')
                    );
                    
                    console.log(`[深度搜索] 表2相关日志行:`, table2RelatedLines);
                    
                    // 深度搜索失败，更新表1的searched字段为2（需重搜）
                    try {
                      const updateSearched = db.prepare('UPDATE rain_event SET searched = 2 WHERE id = ?');
                      const updateResult = updateSearched.run(id);
                      if (updateResult.changes > 0) {
                        console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜）: ${id}`);
                      } else {
                        console.warn(`[深度搜索] ⚠️ 更新表1的searched字段失败（可能事件不存在）: ${id}`);
                      }
                    } catch (updateError) {
                      console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
                      // 不中断流程，继续返回错误响应
                    }
                    
                    sendResponse(false, errorSummary, {
                      stdout: stdout, // 完整输出
                      stderr: stderr, // 完整错误输出
                      has_error: hasError,
                      has_table2_success: hasTable2Success,
                      has_table2_fail: hasTable2Fail,
                      has_llm_error: hasLLMError,
                      exit_code: code,
                      stderr_length: stderr.length,
                      stdout_length: stdout.length,
                      // 提取关键日志行
                      key_logs: {
                        table2_success: stdout.split('\n').filter(line => line.includes('表2数据填充成功') || line.includes('✅ 表2数据已填充')).concat(
                          stderr.split('\n').filter(line => line.includes('表2数据填充成功') || line.includes('✅ 表2数据已填充'))
                        ),
                        table2_fail: stdout.split('\n').filter(line => line.includes('表2数据填充失败') || line.includes('填充表2数据失败')).concat(
                          stderr.split('\n').filter(line => line.includes('表2数据填充失败') || line.includes('填充表2数据失败'))
                        ),
                        table2_related: table2RelatedLines.slice(-20), // 表2相关的所有日志
                        errors: stderr.split('\n').filter(line => line.toLowerCase().includes('error') || line.toLowerCase().includes('exception')).slice(-20),
                        warnings: stderr.split('\n').filter(line => line.toLowerCase().includes('warning')).slice(-20)
                      }
                    });
                  }
                }
              };
              
              // 立即开始第一次检查
              checkTable2();
            } else {
              // 提取关键错误信息
              const errors = stderr.split('\n').filter(line => 
                line.toLowerCase().includes('error') || 
                line.toLowerCase().includes('exception') ||
                line.toLowerCase().includes('traceback')
              ).slice(-20);
              
              // 深度搜索失败（进程退出码非0），更新表1的searched字段为2（需重搜）
              try {
                const updateSearched = db.prepare('UPDATE rain_event SET searched = 2 WHERE id = ?');
                const updateResult = updateSearched.run(id);
                if (updateResult.changes > 0) {
                  console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜）: ${id}`);
                } else {
                  console.warn(`[深度搜索] ⚠️ 更新表1的searched字段失败（可能事件不存在）: ${id}`);
                }
              } catch (updateError) {
                console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
                // 不中断流程，继续返回错误响应
              }
              
              sendResponse(false, `深度搜索执行失败（退出码: ${code}）`, {
                stdout: stdout,
                stderr: stderr,
                exit_code: code,
                key_errors: errors
              });
            }
          });
          
          pythonProcess.on('error', (error: Error) => {
            if (responseSent) return;
            
            // 深度搜索失败（无法启动进程），更新表1的searched字段为2（需重搜）
            try {
              const updateSearched = db.prepare('UPDATE rain_event SET searched = 2 WHERE id = ?');
              const updateResult = updateSearched.run(id);
              if (updateResult.changes > 0) {
                console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜）: ${id}`);
              } else {
                console.warn(`[深度搜索] ⚠️ 更新表1的searched字段失败（可能事件不存在）: ${id}`);
              }
            } catch (updateError) {
              console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
              // 不中断流程，继续返回错误响应
            }
            
            sendResponse(false, `无法启动搜索进程: ${error.message}`);
          });
          
          // 设置超时（4分钟，因为搜索通常需要30秒-1分钟，给一些缓冲时间）
          const timeout = setTimeout(() => {
            if (!pythonProcess.killed) {
              pythonProcess.kill();
              if (!responseSent) {
                // 深度搜索超时，更新表1的searched字段为2（需重搜）
                try {
                  const updateSearched = db.prepare('UPDATE rain_event SET searched = 2 WHERE id = ?');
                  const updateResult = updateSearched.run(id);
                  if (updateResult.changes > 0) {
                    console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜，超时）: ${id}`);
                  } else {
                    console.warn(`[深度搜索] ⚠️ 更新表1的searched字段失败（可能事件不存在）: ${id}`);
                  }
                } catch (updateError) {
                  console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
                  // 不中断流程，继续返回错误响应
                }
                
                sendResponse(false, '深度搜索超时（超过4分钟）。如果搜索确实需要更长时间，请增加超时设置。', {
                  stdout: stdout.substring(0, 1000),
                  stderr: stderr.substring(0, 1000)
                });
              }
            }
          }, 4 * 60 * 1000); // 4分钟超时
          
          // 清理超时定时器
          pythonProcess.on('close', () => {
            clearTimeout(timeout);
          });
          
        } catch (error: any) {
          console.error(`[深度搜索] Promise内部错误:`, error);
          console.error(`[深度搜索] 错误堆栈:`, error?.stack);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: `执行深度搜索时出错: ${error?.message || String(error)}`,
              error_type: error?.constructor?.name || 'Unknown',
              error_stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
            });
          }
          resolve();
        }
      });
      
    } catch (error: any) {
      console.error(`[深度搜索] 外层catch错误:`, error);
      console.error(`[深度搜索] 错误堆栈:`, error?.stack);
      res.status(500).json({
        success: false,
        error: error?.message || String(error),
        error_type: error?.constructor?.name || 'Unknown',
        error_stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      });
    }
  });
}

