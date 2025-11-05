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

    -- 事件候选表（按日期查询的已发生事件）
    CREATE TABLE IF NOT EXISTS event_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_key TEXT UNIQUE, -- 去重用：source_date_country_location
      event_date TEXT NOT NULL, -- YYYY-MM-DD
      country TEXT NOT NULL,
      city TEXT,
      latitude REAL,
      longitude REAL,
      time_from TEXT, -- ISO 时间
      time_to TEXT, -- ISO 时间
      severity TEXT, -- low/medium/high/extreme
      level INTEGER, -- 数值等级
      source TEXT NOT NULL, -- meteoalarm/gdacs/...
      source_url TEXT,
      title TEXT,
      description TEXT,
      raw_data TEXT, -- JSON: 原始响应数据
      enriched BOOLEAN DEFAULT 0, -- 是否已整理
      enriched_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_event_candidates_date ON event_candidates(event_date);
    CREATE INDEX IF NOT EXISTS idx_event_candidates_country ON event_candidates(country);
    CREATE INDEX IF NOT EXISTS idx_event_candidates_source ON event_candidates(source);
    CREATE INDEX IF NOT EXISTS idx_event_candidates_enriched ON event_candidates(enriched);
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
  
  // 创建 event_candidates 表（如果不存在）
  if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_candidates'`).get()) {
    db.exec(`
      CREATE TABLE event_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_key TEXT UNIQUE,
        event_date TEXT NOT NULL,
        country TEXT NOT NULL,
        city TEXT,
        latitude REAL,
        longitude REAL,
        time_from TEXT,
        time_to TEXT,
        severity TEXT,
        level INTEGER,
        source TEXT NOT NULL,
        source_url TEXT,
        title TEXT,
        description TEXT,
        raw_data TEXT,
        enriched BOOLEAN DEFAULT 0,
        enriched_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_event_candidates_date ON event_candidates(event_date);
      CREATE INDEX IF NOT EXISTS idx_event_candidates_country ON event_candidates(country);
      CREATE INDEX IF NOT EXISTS idx_event_candidates_source ON event_candidates(source);
      CREATE INDEX IF NOT EXISTS idx_event_candidates_enriched ON event_candidates(enriched);
    `);
  }
} catch {}


