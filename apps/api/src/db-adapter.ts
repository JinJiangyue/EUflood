/**
 * 数据库适配器接口
 * 当前仅支持 PocketBase 数据库后端
 */

export interface IDatabaseAdapter {
  // 查询单条记录
  get(collection: string, id: string): Promise<any>;
  
  // 查询多条记录（支持过滤、排序、分页）
  find(collection: string, options?: {
    filter?: string;
    sort?: string;
    limit?: number;
    offset?: number;
    expand?: string;
  }): Promise<any[]>;
  
  // 查询记录数量
  count(collection: string, filter?: string): Promise<number>;
  
  // 创建记录
  create(collection: string, data: any): Promise<any>;
  
  // 批量创建记录
  createBatch(collection: string, records: any[]): Promise<any[]>;
  
  // 更新记录
  update(collection: string, id: string, data: any): Promise<any>;
  
  // 删除记录
  delete(collection: string, id: string): Promise<boolean>;
  
  // 注意：PocketBase 不支持原始 SQL 查询
  // 这些方法仅用于向后兼容，当前实现中不应使用
}

