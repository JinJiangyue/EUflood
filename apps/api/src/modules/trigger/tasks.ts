import cron from 'node-cron';
import { runTriggerCheck } from './service';

export function scheduleTriggerJobs() {
  // 每10分钟检查一次降雨/洪水触发
  cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await runTriggerCheck();
      if (result.triggered > 0) {
        console.log(`[Trigger] Detected ${result.triggered} precipitation events, triggered country data collection`);
      }
    } catch (err) {
      console.error('[Trigger] Cron job failed:', err);
    }
  });
}

