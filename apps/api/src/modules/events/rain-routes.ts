// 降雨事件查询路由（基于 rain_event 表）- PocketBase 版本

import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { dbFind, dbGet, dbCount, dbCreate, dbUpdate, buildFilter } from '../../db-helper';

export function registerRainEventsModule(app: Express) {
  // 获取最新的降雨事件（按日期倒序，限制条数）
  app.get('/events/rain/latest', async (req: Request, res: Response) => {
    try {
      const rawLimit = parseInt(req.query.limit as string);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 30;

      const details = await dbFind('rain_event', {
        sort: '-date,country,province,seq',
        limit: limit
      });

      const earliestDate = details.length > 0 ? details[details.length - 1].date : null;
      const latestDate = details.length > 0 ? details[0].date : null;

      res.json({
        success: true,
        details,
        dateRange: {
          from: earliestDate,
          to: latestDate
        },
        total: details.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });

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
      
      // 构建 PocketBase 过滤器
      let filter = `date >= "${dateFrom}" && date <= "${dateTo}"`;
      
      if (country && country.trim() !== '') {
        const countryLower = country.trim().toLowerCase();
        filter += ` && country ~ "${countryLower}"`;
      }
      
      // 获取所有匹配的记录（用于聚合计算）
      const allRecords = await dbFind('rain_event', {
        filter: filter,
        sort: '-date,country,province,seq'
      });
      
      // 在应用层进行聚合计算
      const grouped = new Map<string, any>();
      
      for (const record of allRecords) {
        const key = `${record.date}_${record.country}_${record.province}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            date: record.date,
            country: record.country,
            province: record.province,
            event_count: 0,
            searched_count: 0,
            unsearched_count: 0,
            need_research_count: 0,
            values: [] as number[]
          });
        }
        
        const group = grouped.get(key)!;
        group.event_count++;
        if (record.searched === 1) group.searched_count++;
        else if (record.searched === 0) group.unsearched_count++;
        else if (record.searched === 2) group.need_research_count++;
        if (record.value !== null && record.value !== undefined) {
          group.values.push(record.value);
        }
      }
      
      // 计算统计值
      const events = Array.from(grouped.values()).map(group => ({
        date: group.date,
        country: group.country,
        province: group.province,
        event_count: group.event_count,
        searched_count: group.searched_count,
        unsearched_count: group.unsearched_count,
        need_research_count: group.need_research_count,
        avg_value: group.values.length > 0 
          ? group.values.reduce((a: number, b: number) => a + b, 0) / group.values.length 
          : null,
        max_value: group.values.length > 0 ? Math.max(...group.values) : null,
        min_value: group.values.length > 0 ? Math.min(...group.values) : null
      }));
      
      // 查询详细数据（如果需要）
      const includeDetails = req.query.details === 'true';
      let details: any[] = [];
      let pagination = null;
      
      if (includeDetails) {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = (page - 1) * limit;
        
        const total = allRecords.length;
        const totalPages = Math.ceil(total / limit);
        
        details = allRecords.slice(offset, offset + limit);
        
        pagination = {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        };
      }
      
      // 计算统计信息
      const uniqueDates = new Set(allRecords.map(r => r.date));
      const uniqueCountries = new Set(allRecords.map(r => r.country).filter(Boolean));
      const uniqueProvinces = new Set(allRecords.map(r => r.province).filter(Boolean));
      
      const stats = {
        totalEvents: allRecords.length,
        dateCount: uniqueDates.size,
        countryCount: uniqueCountries.size,
        provinceCount: uniqueProvinces.size,
        totalSearched: allRecords.filter(r => r.searched === 1).length,
        totalUnsearched: allRecords.filter(r => r.searched === 0).length,
        totalNeedResearch: allRecords.filter(r => r.searched === 2).length
      };
      
      res.json({
        success: true,
        dateRange: { from: dateFrom, to: dateTo },
        country: country || 'all',
        stats,
        events,
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
      const rainEventId = decodeURIComponent(req.params.id);
      console.log(`[获取详情] 请求 rain_event_id: ${rainEventId}`);
      
      // 先检查表2中是否有对应记录（使用 filter 查询，因为 PocketBase 使用 id 作为主键，不是 rain_event_id）
      const impacts = await dbFind('rain_flood_impact', {
        filter: `rain_event_id = "${rainEventId}"`,
        limit: 1
      });
      const impact = impacts.length > 0 ? impacts[0] : null;
      
      if (impact) {
        console.log(`[获取详情] 找到表2数据: ${rainEventId}`);
        // 表2有数据，表示已搜索
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
          searched: true,
          event: {
            rain_event_id: impact.rain_event_id,
            date: impact.date,
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
        console.log(`[获取详情] 表2无数据，查询表1: ${rainEventId}`);
        // 表2没有数据，返回表1数据（使用 filter 查询）
        const events = await dbFind('rain_event', {
          filter: `rain_event_id = "${rainEventId}"`,
          limit: 1
        });
        const event = events.length > 0 ? events[0] : null;
        
        if (!event) {
          console.log(`[获取详情] 表1也未找到: ${rainEventId}`);
          return res.status(404).json({ 
            success: false,
            error: '事件未找到' 
          });
        }
        
        console.log(`[获取详情] 找到表1数据: ${rainEventId}`);
        return res.json({
          success: true,
          searched: event.searched === 1,
          event: {
            ...event,
            searched: event.searched || 0,
            searchedText: event.searched === 1 ? '已搜索' : (event.searched === 2 ? '需重搜' : '未搜索')
          }
        });
      }
    } catch (error: any) {
      console.error(`[获取详情] 错误:`, error);
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });
  
  // 更新搜索状态
  app.post('/events/rain/:id/search', async (req: Request, res: Response) => {
    try {
      const rainEventId = decodeURIComponent(req.params.id);
      const searched = req.body.searched === true || req.body.searched === 1 ? 1 : 0;
      
      // 先查找记录（使用 filter 查询）
      const events = await dbFind('rain_event', {
        filter: `rain_event_id = "${rainEventId}"`,
        limit: 1
      });
      const event = events.length > 0 ? events[0] : null;
      
      if (!event) {
        return res.status(404).json({ 
          success: false,
          error: '事件未找到' 
        });
      }
      
      // 使用记录的 id（PocketBase 主键）进行更新
      await dbUpdate('rain_event', event.id, { searched });
      res.json({
        success: true,
        id: rainEventId,
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
      const rainEventId = decodeURIComponent(req.params.id);
      console.log(`[深度搜索] 收到请求，事件ID: ${rainEventId}`);
      
      // 检查事件是否存在（使用 filter 查询，因为 PocketBase 使用 id 作为主键，不是 rain_event_id）
      const events = await dbFind('rain_event', {
        filter: `rain_event_id = "${rainEventId}"`,
        limit: 1
      });
      const event = events.length > 0 ? events[0] : null;
      
      if (!event) {
        console.log(`[深度搜索] 事件未找到: ${rainEventId}`);
        return res.status(404).json({ 
          success: false,
          error: '事件未找到' 
        });
      }
      
      // 检查是否已经搜索过（使用 filter 查询）
      const impacts = await dbFind('rain_flood_impact', {
        filter: `rain_event_id = "${rainEventId}"`,
        limit: 1
      });
      const existingImpact = impacts.length > 0 ? impacts[0] : null;
      
      if (existingImpact) {
        console.log(`[深度搜索] 事件已搜索过: ${rainEventId}`);
        return res.json({
          success: true,
          message: '该事件已经进行过深度搜索',
          already_searched: true
        });
      }
      
      console.log(`[深度搜索] 开始处理事件: ${rainEventId}`);
      
      // 保存 event.id（PocketBase 主键）用于后续更新
      const eventPocketBaseId = event.id;
      
      // 调用Python搜索工作流
      return new Promise<void>((resolve, reject) => {
        try {
          console.log(`[深度搜索] ========== 开始处理深度搜索请求 ==========`);
          console.log(`[深度搜索] 事件ID: ${rainEventId}`);
          
          const { spawn } = require('child_process');
          const path = require('path');
          const fs = require('fs');
          
          // 查找项目根目录
          const cwd = process.cwd();
          console.log(`[深度搜索] 当前工作目录 (cwd): ${cwd}`);
          let projectRoot: string | null = null;
          
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
          
          if (!projectRoot) {
            if (__dirname.includes('dist')) {
              projectRoot = path.resolve(__dirname, '../../../../..');
            } else {
              projectRoot = path.resolve(__dirname, '../../../..');
            }
          }
          
          console.log(`[深度搜索] 找到项目根目录: ${projectRoot}`);
          const searchDir = path.join(projectRoot, 'search');
          if (!fs.existsSync(searchDir)) {
            const errorMsg = `无法找到项目根目录。尝试的路径: ${projectRoot}`;
            console.error(`[深度搜索] ${errorMsg}`);
            res.status(500).json({
              success: false,
              error: errorMsg
            });
            resolve();
            return;
          }
          
          const searchScript = path.join(projectRoot, 'apps', 'api', 'scripts', 'deep_search.py');
          console.log(`[深度搜索] 检查搜索脚本: ${searchScript}`);
          
          if (!fs.existsSync(searchScript)) {
            const errorMsg = `搜索脚本未找到: ${searchScript}`;
            console.error(`[深度搜索] ${errorMsg}`);
            res.status(500).json({
              success: false,
              error: errorMsg
            });
            resolve();
            return;
          }
          
          const pythonEmbedPath = path.join(projectRoot, 'apps', 'api', 'python-embed', 'python.exe');
          const pythonExec = fs.existsSync(pythonEmbedPath) ? pythonEmbedPath : (process.env.PYTHON_EXEC || 'python');
          
          const eventData = {
            id: event.rain_event_id,
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
          
          const safeId = rainEventId.replace(/[^a-zA-Z0-9_]/g, '_');
          const tempJsonFile = path.join(projectRoot, `temp_event_${safeId}.json`);
          
          console.log(`[深度搜索] 创建临时JSON文件: ${tempJsonFile}`);
          fs.writeFileSync(tempJsonFile, JSON.stringify(eventData, null, 2), 'utf-8');
          
          if (!fs.existsSync(tempJsonFile)) {
            throw new Error(`无法创建临时JSON文件: ${tempJsonFile}`);
          }
          
          const scriptRelativePath = path.relative(projectRoot, searchScript);
          const jsonRelativePath = path.relative(projectRoot, tempJsonFile);
          
          const env: NodeJS.ProcessEnv = {
            ...process.env,
            PYTHONPATH: projectRoot || undefined,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1'
          };
          
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
              delete env[key];
            }
          }
          
          const pythonProcess = spawn(pythonExec, [searchScript, '--json', tempJsonFile], {
            cwd: projectRoot,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: env
          });
          
          console.log(`[深度搜索] Python进程已启动，PID: ${pythonProcess.pid}`);
          
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
            if (responseSent) return;
            responseSent = true;
            
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            
            if (success) {
              res.json({
                success: true,
                message,
                event_id: rainEventId,
                ...data
              });
            } else {
              res.status(500).json({
                success: false,
                error: message,
                ...data
              });
            }
            resolve();
          };
          
          pythonProcess.stdout.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            stdout += text;
            console.log(`[深度搜索] Python stdout:`, text.substring(0, 200));
          });
          
          pythonProcess.stderr.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            stderr += text;
            console.error(`[深度搜索] Python stderr:`, text.substring(0, 200));
          });
          
          pythonProcess.on('close', async (code: number) => {
            console.log(`[深度搜索] Python进程关闭，退出码: ${code}`);
            if (responseSent) return;
            
            if (code === 0) {
              console.log(`[深度搜索] Python进程成功完成，开始解析结果并写入数据库`);
              
              try {
                // 解析 stdout 中的 JSON 结果（最后一行应该是 JSON）
                const lines = stdout.trim().split('\n');
                let resultJson: any = null;
                
                // 从最后一行开始查找 JSON
                for (let i = lines.length - 1; i >= 0; i--) {
                  const line = lines[i].trim();
                  if (line && line.startsWith('{')) {
                    try {
                      resultJson = JSON.parse(line);
                      if (resultJson.success && resultJson.table2_data) {
                        break;
                      }
                    } catch (e) {
                      // 继续查找
                    }
                  }
                }
                
                if (resultJson && resultJson.success && resultJson.table2_data) {
                  console.log(`[深度搜索] ✅ 解析到表2数据`);
                  
                  // 写入表2数据到 PocketBase
                  try {
                    const table2Data = resultJson.table2_data;
                    
                    // 检查记录是否已存在
                    const existing = await dbFind('rain_flood_impact', {
                      filter: `rain_event_id = "${table2Data.rain_event_id}"`,
                      limit: 1
                    });
                    
                    if (existing.length > 0) {
                      // 更新现有记录
                      await dbUpdate('rain_flood_impact', existing[0].id, table2Data);
                      console.log(`[深度搜索] ✅ 已更新表2记录`);
                    } else {
                      // 创建新记录
                      await dbCreate('rain_flood_impact', table2Data);
                      console.log(`[深度搜索] ✅ 已创建表2记录`);
                    }
                    
                    // 更新表1的searched字段为1
                    await dbUpdate('rain_event', eventPocketBaseId, { searched: 1 });
                    console.log(`[深度搜索] ✅ 已更新表1的searched字段为1`);
                    
                    sendResponse(true, '深度搜索完成，已生成影响评估报告和表2数据', {
                      report_file: resultJson.report_file
                    });
                  } catch (dbError: any) {
                    console.error(`[深度搜索] ❌ 写入数据库失败:`, dbError);
                    // 更新表1的searched字段为2（需重搜）
                    try {
                      await dbUpdate('rain_event', eventPocketBaseId, { searched: 2 });
                    } catch (updateError) {
                      console.error(`[深度搜索] ❌ 更新表1的searched字段失败:`, updateError);
                    }
                    sendResponse(false, '深度搜索完成，但写入数据库失败', {
                      error: dbError?.message || String(dbError),
                      stdout,
                      stderr
                    });
                  }
                } else {
                  console.log(`[深度搜索] ⚠️ 未找到表2数据，可能处理失败`);
                  // 更新表1的searched字段为2（需重搜）
                  try {
                    await dbUpdate('rain_event', eventPocketBaseId, { searched: 2 });
                    console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜）`);
                  } catch (updateError) {
                    console.error(`[深度搜索] ❌ 更新表1的searched字段失败:`, updateError);
                  }
                  
                  sendResponse(false, '深度搜索执行完成，但未找到表2数据', {
                    stdout,
                    stderr,
                    exit_code: code
                  });
                }
              } catch (parseError: any) {
                console.error(`[深度搜索] ❌ 解析结果失败:`, parseError);
                // 更新表1的searched字段为2（需重搜）
                try {
                  await dbUpdate('rain_event', eventPocketBaseId, { searched: 2 });
                } catch (updateError) {
                  console.error(`[深度搜索] ❌ 更新表1的searched字段失败:`, updateError);
                }
                sendResponse(false, '解析深度搜索结果失败', {
                  error: parseError?.message || String(parseError),
                  stdout,
                  stderr,
                  exit_code: code
                });
              }
            } else {
              try {
                // 使用 PocketBase 主键 id 进行更新
                await dbUpdate('rain_event', eventPocketBaseId, { searched: 2 });
                console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜）`);
              } catch (updateError) {
                console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
              }
              
              sendResponse(false, `深度搜索执行失败（退出码: ${code}）`, {
                stdout,
                stderr,
                exit_code: code
              });
            }
          });
          
          pythonProcess.on('error', async (error: Error) => {
            if (responseSent) return;
            
            try {
              // 使用 PocketBase 主键 id 进行更新
              await dbUpdate('rain_event', eventPocketBaseId, { searched: 2 });
              console.log(`[深度搜索] ⚠️ 已更新表1的searched字段为2（需重搜）`);
            } catch (updateError) {
              console.error(`[深度搜索] ❌ 更新表1的searched字段时出错:`, updateError);
            }
            
            sendResponse(false, `无法启动搜索进程: ${error.message}`);
          });
          
          const timeout = setTimeout(() => {
            if (!pythonProcess.killed) {
              pythonProcess.kill();
              if (!responseSent) {
                // 使用 PocketBase 主键 id 进行更新
                dbUpdate('rain_event', eventPocketBaseId, { searched: 2 }).catch(console.error);
                sendResponse(false, '深度搜索超时（超过4分钟）', {
                  stdout: stdout.substring(0, 1000),
                  stderr: stderr.substring(0, 1000)
                });
              }
            }
          }, 4 * 60 * 1000);
          
          pythonProcess.on('close', () => {
            clearTimeout(timeout);
          });
          
        } catch (error: any) {
          console.error(`[深度搜索] Promise内部错误:`, error);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: `执行深度搜索时出错: ${error?.message || String(error)}`
            });
          }
          resolve();
        }
      });
      
    } catch (error: any) {
      console.error(`[深度搜索] 外层catch错误:`, error);
      res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });
}

