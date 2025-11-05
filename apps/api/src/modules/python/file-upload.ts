// 文件上传处理模块
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getUploadDir, getOutputDir } from './config';
import crypto from 'crypto';

// 生成唯一文件名
function generateUniqueFilename(originalname: string): string {
  const ext = path.extname(originalname);
  const name = path.basename(originalname, ext);
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(4).toString('hex');
  return `${name}_${timestamp}_${randomId}${ext}`;
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = getUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  }
});

// 文件过滤器（只允许特定类型）
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // 允许的文件类型
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/json',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.csv') || 
      file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.json') ||
      file.originalname.endsWith('.txt')) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型。只支持 CSV、Excel、JSON、TXT 文件。'));
  }
};

// 创建multer实例
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// 文件上传中间件（单文件）
export const uploadSingle = upload.single('file');

// 获取文件信息
export function getFileInfo(file: Express.Multer.File, basePath: string) {
  const uploadDir = getUploadDir();
  const filePath = path.join(uploadDir, file.filename);
  const fileSize = fs.statSync(filePath).size;
  const fileId = crypto.randomBytes(8).toString('hex');
  
  return {
    id: fileId,
    originalName: file.originalname,
    filename: file.filename,
    path: filePath,
    relativePath: path.relative(basePath, filePath),
    size: fileSize,
    mimetype: file.mimetype,
    uploadedAt: new Date().toISOString()
  };
}

// 清理临时文件
export function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Failed to cleanup file ${filePath}:`, error);
  }
}

