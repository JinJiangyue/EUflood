/**
 * SQLite 数据库适配器实现
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { IDatabaseAdapter } from './db-adapter';

export class SQLiteAdapter implements IDatabaseAdapter {
  private db: Database.Database;

  constructor(dbFile: string) {
    const isNew = !fs.existsSync(dbFile);
    this.db = new Database(dbFile);
    
    if (isNew) {
      this.initializeTables();
    }
  }

  private initializeTables() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS rain_event (
        rain_event_id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        country TEXT,
        province TEXT NOT NULL,
        city TEXT,
        longitude REAL NOT NULL,
        latitude REAL NOT NULL,
        value REAL,
        threshold REAL,
        return_period_band TEXT,
        file_name TEXT NOT NULL,
        seq INTEGER,
        searched INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_re_date ON rain_event(date);
      CREATE INDEX IF NOT EXISTS idx_re_region ON rain_event(province);
      CREATE INDEX IF NOT EXISTS idx_re_value ON rain_event(value);
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_rain_event_dupe ON rain_event(date, file_name, longitude, latitude);

      CREATE TABLE IF NOT EXISTS rain_flood_impact (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rain_event_id TEXT NOT NULL UNIQUE,
        date TEXT,
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

  // 将表名映射为 SQLite 表名
  private mapCollectionToTable(collection: string): string {
    const mapping: Record<string, string> = {
      'rain_events': 'rain_event',
      'rain_flood_impacts': 'rain_flood_impact'
    };
    return mapping[collection] || collection;
  }

  async get(collection: string, id: string): Promise<any> {
    const table = this.mapCollectionToTable(collection);
    const primaryKey = collection === 'rain_events' ? 'rain_event_id' : 'id';
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE ${primaryKey} = ?`);
    return stmt.get(id) || null;
  }

  async find(collection: string, options?: {
    filter?: string;
    sort?: string;
    limit?: number;
    offset?: number;
    expand?: string;
  }): Promise<any[]> {
    const table = this.mapCollectionToTable(collection);
    let sql = `SELECT * FROM ${table}`;
    const params: any[] = [];

    if (options?.filter) {
      // 简单的 WHERE 子句支持
      sql += ` WHERE ${options.filter}`;
    }

    if (options?.sort) {
      sql += ` ORDER BY ${options.sort}`;
    }

    if (options?.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as any[];
  }

  async count(collection: string, filter?: string): Promise<number> {
    const table = this.mapCollectionToTable(collection);
    let sql = `SELECT COUNT(*) as count FROM ${table}`;
    
    if (filter) {
      sql += ` WHERE ${filter}`;
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get() as any;
    return result?.count || 0;
  }

  async create(collection: string, data: any): Promise<any> {
    const table = this.mapCollectionToTable(collection);
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(key => data[key]);
    
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
    
    // 返回创建的记录
    const primaryKey = collection === 'rain_events' ? 'rain_event_id' : 'id';
    return this.get(collection, data[primaryKey]);
  }

  async createBatch(collection: string, records: any[]): Promise<any[]> {
    const results: any[] = [];
    for (const record of records) {
      results.push(await this.create(collection, record));
    }
    return results;
  }

  async update(collection: string, id: string, data: any): Promise<any> {
    const table = this.mapCollectionToTable(collection);
    const primaryKey = collection === 'rain_events' ? 'rain_event_id' : 'id';
    const keys = Object.keys(data).filter(k => k !== primaryKey);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    const values = keys.map(key => data[key]);
    values.push(id);
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${primaryKey} = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
    
    return this.get(collection, id);
  }

  async delete(collection: string, id: string): Promise<boolean> {
    const table = this.mapCollectionToTable(collection);
    const primaryKey = collection === 'rain_events' ? 'rain_event_id' : 'id';
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${primaryKey} = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // SQLite 特有的方法
  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    this.db.exec(sql);
  }
}

