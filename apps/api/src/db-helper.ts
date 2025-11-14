/**
 * 数据库操作辅助函数
 * 提供便捷的方法来执行常见的数据库操作
 */

import { db } from './db';

// PocketBase 集合名称映射
// 注意：PocketBase 中的集合名称是 rain_event 和 rain_flood_impact（单数形式）
const COLLECTIONS = {
  rain_event: 'rain_event',
  rain_flood_impact: 'rain_flood_impact'
} as const;

/**
 * 构建 PocketBase 过滤器
 * PocketBase 过滤器语法：https://pocketbase.io/docs/filtering/
 */
export function buildFilter(conditions: Record<string, any>): string {
  const filters: string[] = [];
  
  for (const [key, value] of Object.entries(conditions)) {
    if (value === null || value === undefined) {
      continue;
    }
    
    // 跳过特殊键（如 date2）
    if (key === 'date2') {
      continue;
    }
    
    if (typeof value === 'string' && value.includes('%')) {
      // LIKE 查询 - PocketBase 使用 ~ 操作符
      const cleanValue = value.replace(/%/g, '');
      filters.push(`${key} ~ "${cleanValue}"`);
    } else if (key.endsWith('_like')) {
      // 模糊匹配
      const fieldName = key.replace('_like', '');
      const cleanValue = value.replace(/%/g, '');
      filters.push(`${fieldName} ~ "${cleanValue}"`);
    } else if (Array.isArray(value)) {
      // IN 查询
      const values = value.map(v => typeof v === 'string' ? `"${v}"` : v).join(',');
      filters.push(`${key} ~ (${values})`);
    } else if (typeof value === 'object' && value.operator) {
      // 操作符查询 (>, <, >=, <=, !=)
      const op = value.operator;
      const val = typeof value.value === 'string' ? `"${value.value}"` : value.value;
      filters.push(`${key} ${op} ${val}`);
    } else {
      // 等值查询
      const val = typeof value === 'string' ? `"${value}"` : value;
      filters.push(`${key} = ${val}`);
    }
  }
  
  // 处理日期范围（date >= X && date <= Y）
  if (conditions.date && conditions.date2) {
    const dateFilter = `date >= "${conditions.date.value || conditions.date}" && date <= "${conditions.date2.value || conditions.date2}"`;
    // 移除单独的 date 条件，使用组合条件
    const filtered = filters.filter(f => !f.startsWith('date '));
    filtered.unshift(dateFilter);
    return filtered.join(' && ');
  }
  
  return filters.join(' && ');
}

/**
 * 查询单条记录
 */
export async function dbGet(collection: string, id: string): Promise<any> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.get(pbCollection, id);
}

/**
 * 查询多条记录
 */
export async function dbFind(collection: string, options?: {
  filter?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.find(pbCollection, options);
}

/**
 * 查询记录数量
 */
export async function dbCount(collection: string, filter?: string): Promise<number> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.count(pbCollection, filter);
}

/**
 * 创建记录
 */
export async function dbCreate(collection: string, data: any): Promise<any> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.create(pbCollection, data);
}

/**
 * 批量创建记录
 */
export async function dbCreateBatch(collection: string, records: any[]): Promise<any[]> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.createBatch(pbCollection, records);
}

/**
 * 更新记录
 */
export async function dbUpdate(collection: string, id: string, data: any): Promise<any> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.update(pbCollection, id, data);
}

/**
 * 删除记录
 */
export async function dbDelete(collection: string, id: string): Promise<boolean> {
  const pbCollection = COLLECTIONS[collection as keyof typeof COLLECTIONS] || collection;
  return await db.delete(pbCollection, id);
}

// 注意：PocketBase 不支持原始 SQL 查询
// 所有数据库操作都应使用上面的适配器方法

