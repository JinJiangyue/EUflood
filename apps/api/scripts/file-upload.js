"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSingle = exports.upload = void 0;
exports.getFileInfo = getFileInfo;
exports.cleanupFile = cleanupFile;
// 文件上传处理模块
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./config");
const crypto_1 = __importDefault(require("crypto"));
// 直接使用原始文件名（同名文件会覆盖）
// 配置multer存储
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = (0, config_1.getUploadDir)();
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 直接使用原始文件名，同名文件会覆盖
        // 如果文件已存在，multer 会自动覆盖
        cb(null, file.originalname);
    }
});
// 文件过滤器（只允许特定类型）
const fileFilter = (req, file, cb) => {
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
    }
    else {
        cb(new Error('不支持的文件类型。只支持 CSV、Excel、JSON、TXT 文件。'));
    }
};
// 创建multer实例
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});
// 文件上传中间件（单文件）
exports.uploadSingle = exports.upload.single('file');
// 获取文件信息
function getFileInfo(file, basePath) {
    const uploadDir = (0, config_1.getUploadDir)();
    const filePath = path_1.default.join(uploadDir, file.filename);
    const fileSize = fs_1.default.statSync(filePath).size;
    const fileId = crypto_1.default.randomBytes(8).toString('hex');
    return {
        id: fileId,
        originalName: file.originalname,
        filename: file.filename,
        path: filePath,
        relativePath: path_1.default.relative(basePath, filePath),
        size: fileSize,
        mimetype: file.mimetype,
        uploadedAt: new Date().toISOString()
    };
}
// 清理临时文件
function cleanupFile(filePath) {
    try {
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    catch (error) {
        console.error(`Failed to cleanup file ${filePath}:`, error);
    }
}
