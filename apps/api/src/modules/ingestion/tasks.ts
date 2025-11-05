import cron from 'node-cron';
import { ingestDemoFloodRecords } from './service';

export function scheduleIngestionJobs() {
  // 每 30 分钟生成少量数据（示例）。开发期可注释掉。
  cron.schedule('*/30 * * * *', () => {
    try {
      ingestDemoFloodRecords({ count: 5 });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Ingestion cron failed', err);
    }
  });
}


