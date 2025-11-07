import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'fs';

const dbFile = process.env.DB_FILE || './dev.db';
const isNew = !fs.existsSync(dbFile);
export const db = new Database(dbFile);

if (isNew) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS flood_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT UNIQUE, -- 去重用的稳定ID（hash-based）
      description TEXT NOT NULL,
      title TEXT,
      water_level REAL,
      country TEXT,
      specific_location TEXT,
      event_time TEXT,
      coordinates TEXT, -- JSON: {"type":"Point","coordinates":[-3.7,40.4]}
      severity TEXT, -- low/medium/high/extreme
      type TEXT, -- flood/warning/alert
      status TEXT, -- new/processed/verified
      risk_score REAL,
      processed_at TEXT,
      -- 来源与置信度
      source_type TEXT, -- official_api/social_media/news/sensor
      source_name TEXT,
      source_url TEXT,
      language_code TEXT,
      confidence REAL, -- 0-1
      evidence_count INTEGER DEFAULT 1, -- 多源证据数量
      metadata TEXT, -- JSON: 存储原始数据/解析器版本/证据链等
      collected_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_flood_records_created_at ON flood_records (created_at);
    CREATE INDEX IF NOT EXISTS idx_flood_records_event_time ON flood_records (event_time);
    CREATE INDEX IF NOT EXISTS idx_flood_records_country ON flood_records (country);
    CREATE INDEX IF NOT EXISTS idx_flood_records_record_id ON flood_records (record_id);
    CREATE INDEX IF NOT EXISTS idx_flood_records_source_type ON flood_records (source_type);
    CREATE INDEX IF NOT EXISTS idx_flood_records_confidence ON flood_records (confidence);

    -- 降雨事件表（一行=一个地点的一次降雨），主键由触发器生成：YYYYMMDD_Province_seq
    CREATE TABLE IF NOT EXISTS rain_event (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      country TEXT,
      province TEXT NOT NULL,
      city TEXT,
      longitude REAL NOT NULL,
      latitude REAL NOT NULL,
      value REAL,
      threshold REAL,
      file_name TEXT NOT NULL,
      seq INTEGER,
      searched INTEGER DEFAULT 0 -- 0: 未搜索；1: 已搜索
    );

    CREATE INDEX IF NOT EXISTS idx_re_date ON rain_event(date);
    CREATE INDEX IF NOT EXISTS idx_re_region ON rain_event(province);
    CREATE INDEX IF NOT EXISTS idx_re_value ON rain_event(value);
    -- 同一天同一文件的同一坐标不重复
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_rain_event_dupe ON rain_event(date, file_name, longitude, latitude);

    -- 说明：SQLite 触发器不支持为 NEW 赋值，这里不创建触发器。
    -- id 与 seq 改为在应用层（Node 路由）计算后写入。
  `);
}

// 升级旧库列（如果缺失则新增）
function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return rows.some(r => r.name === column);
}

const upgradeColumns = [
  'country', 'specific_location', 'event_time',
  'record_id', 'title', 'coordinates', 'severity', 'type',
  'source_type', 'source_name', 'source_url', 'language_code',
  'confidence', 'evidence_count', 'metadata', 'collected_at'
];

try {
  for (const col of upgradeColumns) {
    if (!columnExists('flood_records', col)) {
      const type = col === 'confidence' || col === 'risk_score' ? 'REAL' :
                   col === 'evidence_count' ? 'INTEGER' : 'TEXT';
      db.exec(`ALTER TABLE flood_records ADD COLUMN ${col} ${type}`);
    }
  }

  // 确保存在 rain_event 表与索引/触发器（老库升级）
  if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='rain_event'`).get()) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rain_event (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        country TEXT,
        province TEXT NOT NULL,
        city TEXT,
        longitude REAL NOT NULL,
        latitude REAL NOT NULL,
        value REAL,
        threshold REAL,
        file_name TEXT NOT NULL,
        seq INTEGER,
        searched INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_re_date ON rain_event(date);
      CREATE INDEX IF NOT EXISTS idx_re_region ON rain_event(province);
      CREATE INDEX IF NOT EXISTS idx_re_value ON rain_event(value);
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_rain_event_dupe ON rain_event(date, file_name, longitude, latitude);
      -- 不创建触发器；由应用层写入 id/seq。
    `);
  }

  // 升级：为 rain_event 增加 searched 列（0/1 标识是否已搜索）
  try {
    const info = db.prepare(`PRAGMA table_info(rain_event)`).all() as any[];
    const hasSearched = info.some(c => c.name === 'searched');
    if (!hasSearched) {
      db.exec(`ALTER TABLE rain_event ADD COLUMN searched INTEGER DEFAULT 0`);
    }
  } catch {}
} catch {}


