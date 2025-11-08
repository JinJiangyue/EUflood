import { db } from '../../db';

// 注释掉：不再使用 flood_records 表
/*
function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return rows.some(r => r.name === column);
}

function ensureSchema() {
  // 兼容旧版 SQLite：通过 PRAGMA 检测后再新增列
  if (!columnExists('flood_records', 'status')) {
    db.exec(`ALTER TABLE flood_records ADD COLUMN status TEXT`);
  }
  if (!columnExists('flood_records', 'risk_score')) {
    db.exec(`ALTER TABLE flood_records ADD COLUMN risk_score REAL`);
  }
  if (!columnExists('flood_records', 'processed_at')) {
    db.exec(`ALTER TABLE flood_records ADD COLUMN processed_at TEXT`);
  }
}
*/

export function processNewRecords(): { processed: number } {
  // TODO: 重构为使用 rain_event 和 rain_flood_impact 表
  // 暂时禁用，等待重构
  return { processed: 0 };
  
  /* 注释掉：使用 flood_records 表的旧代码
  ensureSchema();
  const select = db.prepare(`SELECT id, water_level FROM flood_records WHERE status IS NULL OR status = 'new'`);
  const update = db.prepare(`UPDATE flood_records SET status = 'processed', risk_score = ?, processed_at = datetime('now') WHERE id = ?`);

  const rows: { id: number; water_level: number | null }[] = select.all() as any;
  const txn = db.transaction((items: typeof rows) => {
    for (const r of items) {
      const wl = typeof r.water_level === 'number' ? r.water_level : 0;
      const risk = Math.min(1, wl / 5); // 简单映射 0~5m → 0~1 风险
      update.run(risk, r.id);
    }
  });
  txn(rows);
  return { processed: rows.length };
  */
}


