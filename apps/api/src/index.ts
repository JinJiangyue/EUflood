import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import path from 'path';
import { registerRoutes } from './routes';
import { scheduleTriggerJobs } from './modules/trigger/tasks';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// 配置JSON解析
app.use(express.json());

// 设置全局响应头，确保所有JSON响应使用UTF-8编码
app.use((_req, res, next) => {
  // 只在响应JSON时设置Content-Type（避免覆盖其他类型的响应）
  const originalJson = res.json.bind(res);
  res.json = function(body: any) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    return originalJson(body);
  };
  next();
});

// 配置静态文件服务 - 提供 frontend 目录下的文件
const root = path.resolve(__dirname, '../../..');
app.use('/frontend', express.static(path.join(root, 'frontend'), {
  setHeaders: (res, filePath) => {
    // 设置正确的 MIME 类型
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

registerRoutes(app);

// 返回项目根目录的 index.html，让首页使用你的现有页面
app.get('/', (_req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

// 启动定时任务（触发器）
if (process.env.ENABLE_TRIGGER === 'true') {
  scheduleTriggerJobs();
  logger.info('Trigger jobs scheduled (every 10 minutes)');
}

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});


