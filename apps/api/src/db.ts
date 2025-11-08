import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// 数据库文件路径：优先使用环境变量，否则使用新位置 apps/database/dev.db
// 如果环境变量是相对路径，从项目根目录解析
let dbFile: string;
if (process.env.DB_FILE) {
  if (path.isAbsolute(process.env.DB_FILE)) {
    dbFile = process.env.DB_FILE;
  } else {
    // 相对路径：从项目根目录解析
    const projectRoot = path.resolve(__dirname, '../../..');
    dbFile = path.resolve(projectRoot, process.env.DB_FILE);
  }
} else {
  // 默认路径：apps/database/dev.db
  const projectRoot = path.resolve(__dirname, '../../..');
  dbFile = path.resolve(projectRoot, 'apps', 'database', 'dev.db');
}
const isNew = !fs.existsSync(dbFile);
export const db = new Database(dbFile);

if (isNew) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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

    -- 降雨洪水影响汇总表（一行=一场降雨的影响汇总）
    CREATE TABLE IF NOT EXISTS rain_flood_impact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rain_event_id TEXT NOT NULL UNIQUE,
      time TEXT,
      level INTEGER,
      country TEXT,
      province TEXT,
      city TEXT,
      transport_impact_level INTEGER,
      economy_impact_level INTEGER,
      safety_impact_level INTEGER,
      timeline_data TEXT,
      source_count INTEGER,
      detail_file TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_rain_event_id ON rain_flood_impact(rain_event_id);
    CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_level ON rain_flood_impact(level);
    CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_country ON rain_flood_impact(country);
    CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_province ON rain_flood_impact(province);
  `);
}

// 升级旧库（如果缺失则新增）
function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return rows.some(r => r.name === column);
}

try {
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

  // 确保存在 rain_flood_impact 表（老库升级）
  if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='rain_flood_impact'`).get()) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rain_flood_impact (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rain_event_id TEXT NOT NULL UNIQUE,
        time TEXT,
        level INTEGER,
        country TEXT,
        province TEXT,
        city TEXT,
        transport_impact_level INTEGER,
        economy_impact_level INTEGER,
        safety_impact_level INTEGER,
        timeline_data TEXT,
        source_count INTEGER,
        detail_file TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_rain_event_id ON rain_flood_impact(rain_event_id);
      CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_level ON rain_flood_impact(level);
      CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_country ON rain_flood_impact(country);
      CREATE INDEX IF NOT EXISTS idx_rain_flood_impact_province ON rain_flood_impact(province);
    `);
  }
} catch {}


