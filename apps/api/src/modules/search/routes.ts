import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';

export function registerSearchModule(app: Express) {
  // TODO: 重构为使用 rain_event 和 rain_flood_impact 表
  // 暂时禁用，等待重构
  return;
}


