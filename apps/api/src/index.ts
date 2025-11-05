import 'dotenv/config';
import express from 'express';
import pino from 'pino';
import path from 'path';
import { registerRoutes } from './routes';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(express.json());
registerRoutes(app);

// 返回项目根目录的 index.html，让首页使用你的现有页面
app.get('/', (_req, res) => {
  const root = path.resolve(__dirname, '../../..');
  res.sendFile(path.join(root, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  logger.info(`API listening on http://localhost:${port}`);
});


