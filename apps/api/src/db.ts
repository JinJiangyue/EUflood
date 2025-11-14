/**
 * 数据库连接模块
 * 直接使用 PocketBase
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { IDatabaseAdapter } from './db-adapter';
import { PocketBaseAdapter } from './db-pocketbase';

// 确保加载 .env 文件（在模块加载时）
// 从当前文件位置向上查找项目根目录
let projectRoot: string | null = null;
let currentDir = __dirname;

for (let i = 0; i < 10; i++) {
  const appsPath = path.join(currentDir, 'apps');
  if (fs.existsSync(appsPath) && fs.statSync(appsPath).isDirectory()) {
    projectRoot = currentDir;
    break;
  }
  const parent = path.dirname(currentDir);
  if (parent === currentDir) break;
  currentDir = parent;
}

// 如果找到了项目根目录，从那里加载 .env 文件
if (projectRoot) {
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
} else {
  dotenv.config();
}

// 使用 PocketBase
const pbUrl = process.env.POCKETBASE_URL;
const pbEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const pbPassword = process.env.POCKETBASE_ADMIN_PASSWORD;
const pbToken = process.env.POCKETBASE_ADMIN_TOKEN;

if (!pbUrl) {
  throw new Error('POCKETBASE_URL 环境变量未设置');
}

// 优先使用邮箱密码认证，如果没有则使用 token
if (!pbEmail || !pbPassword) {
  if (!pbToken) {
    throw new Error('请设置 POCKETBASE_ADMIN_EMAIL 和 POCKETBASE_ADMIN_PASSWORD，或设置 POCKETBASE_ADMIN_TOKEN');
  } else {
    console.warn('警告：未设置 POCKETBASE_ADMIN_EMAIL 和 POCKETBASE_ADMIN_PASSWORD，将使用 Token 认证');
  }
}

console.log(`使用 PocketBase 数据库: ${pbUrl}`);
const db: IDatabaseAdapter = new PocketBaseAdapter(pbUrl, pbEmail, pbPassword, pbToken);

export { db };
export type { IDatabaseAdapter };
