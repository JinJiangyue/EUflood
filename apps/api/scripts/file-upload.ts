// 文件上传处理模块
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getUploadDir, getOutputDir } from './config';
import crypto from 'crypto';

// 按年月文件夹存储文件
// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = getUploadDir();
      
      // 从文件名中提取日期（格式：pr6_20241001000000.txt 或类似）
      // 尝试匹配 YYYYMMDD 格式（8位连续数字）
      const dateMatch = file.originalname.match(/(\d{4})(\d{2})(\d{2})/);
      let yearMonthDir = uploadDir;
      
      if (dateMatch && dateMatch.length >= 3) {
        const year = dateMatch[1];   // 2024
        const month = dateMatch[2];  // 10
        yearMonthDir = path.join(uploadDir, `${year}${month}`);
        console.log('[File Upload] Extracted date from filename:', { year, month, yearMonth: `${year}${month}` });
      } else {
        // 如果没有找到日期，使用当前日期
        const now = new Date();
        const year = now.getFullYear().toString();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        yearMonthDir = path.join(uploadDir, `${year}${month}`);
        console.log('[File Upload] Using current date:', { year, month, yearMonth: `${year}${month}` });
      }
      
      // 确保年月文件夹存在
      if (!fs.existsSync(yearMonthDir)) {
        fs.mkdirSync(yearMonthDir, { recursive: true });
        console.log('[File Upload] Created year-month directory:', yearMonthDir);
      } else {
        console.log('[File Upload] Year-month directory already exists:', yearMonthDir);
      }
      
      console.log('[File Upload] Upload directory:', yearMonthDir);
      console.log('[File Upload] File originalname:', file.originalname);
      cb(null, yearMonthDir);
    } catch (error: any) {
      console.error('[File Upload] Error in destination callback:', error);
      // 如果出错，回退到根目录
      cb(null, getUploadDir());
    }
  },
  filename: (req, file, cb) => {
    // 直接使用原始文件名，同名文件会覆盖
    // 如果文件已存在，multer 会自动覆盖
    cb(null, file.originalname);
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
  // 使用 file.path（multer保存后的完整路径，已包含年月文件夹）
  // 如果 file.path 不存在，则回退到使用 uploadDir + filename
  const filePath = file.path || path.join(getUploadDir(), file.filename);
  const fileSize = fs.statSync(filePath).size;
  const fileId = crypto.randomBytes(8).toString('hex');
  
  return {
    id: fileId,
    originalName: file.originalname,
    filename: file.filename,
    path: filePath, // 使用multer保存的完整路径（包含年月文件夹）
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

