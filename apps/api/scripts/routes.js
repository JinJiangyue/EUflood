"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPythonModule = registerPythonModule;
const zod_1 = require("zod");
const service_1 = require("./service");
const executor_1 = require("./utils/executor");
const config_1 = require("./config");
const file_upload_1 = require("./file-upload");
const path_1 = __importDefault(require("path"));
const db_1 = require("../src/db");
function registerPythonModule(app) {
    console.log('[Python Module] Registering Python module routes...');
    // 获取运行环境信息
    app.get('/python/runtime', (_req, res) => {
        try {
            const info = (0, config_1.getRuntimeInfo)();
            res.json({
                success: true,
                ...info
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    // 健康检查：检查Python是否可用
    app.get('/python/health', async (req, res) => {
        try {
            const pythonPath = req.query.python_path || process.env.PYTHON_PATH || 'python3';
            const available = await (0, executor_1.checkPythonAvailable)(pythonPath);
            res.json({
                available,
                pythonPath,
                message: available ? 'Python is available' : 'Python is not available'
            });
        }
        catch (error) {
            res.status(500).json({
                available: false,
                error: error.message
            });
        }
    });
    // 文件上传接口
    app.post('/python/upload', (req, res) => {
        (0, file_upload_1.uploadSingle)(req, res, (err) => {
            if (err) {
                console.error('[Upload] Error:', err);
                return res.status(400).json({
                    success: false,
                    error: err.message || 'File upload failed',
                    details: err.code || 'UNKNOWN_ERROR'
                });
            }
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded',
                    details: 'Request does not contain a file'
                });
            }
            try {
                const fileInfo = (0, file_upload_1.getFileInfo)(req.file, process.cwd());
                res.json({
                    success: true,
                    file: fileInfo
                });
            }
            catch (error) {
                console.error('[Upload] Processing error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message || 'Failed to process uploaded file'
                });
            }
        });
    });
    // 处理上传的文件（使用Python脚本）
    app.post('/python/process-file', async (req, res) => {
        try {
            const schema = zod_1.z.object({
                fileId: zod_1.z.string().optional(),
                filename: zod_1.z.string().optional(),
                script: zod_1.z.string().default('process_file.py'),
                options: zod_1.z.record(zod_1.z.any()).optional()
            });
            const { fileId, filename, script, options } = schema.parse(req.body);
            // 查找文件
            const { getUploadDir } = await Promise.resolve().then(() => __importStar(require('./config')));
            const uploadDir = getUploadDir();
            let filePath;
            if (filename) {
                filePath = path_1.default.join(uploadDir, filename);
            }
            else {
                return res.status(400).json({
                    success: false,
                    error: 'Either fileId or filename must be provided'
                });
            }
            // 检查文件是否存在
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
            // 调用Python脚本处理文件
            console.log(`[ProcessFile] Processing file: ${filePath}`);
            console.log(`[ProcessFile] Script: ${script}`);
            console.log(`[ProcessFile] Upload dir: ${uploadDir}`);
            const result = await (0, service_1.executePythonScriptJSON)(script, {
                input_file: filePath,
                ...options
            });
            if (result.success) {
                console.log(`[ProcessFile] Success: ${result.executionTime}ms`);
                res.json({
                    success: true,
                    data: result.data,
                    executionTime: result.executionTime
                });
            }
            else {
                console.error(`[ProcessFile] Failed: ${result.error}`);
                console.error(`[ProcessFile] Execution time: ${result.executionTime}ms`);
                res.status(500).json({
                    success: false,
                    error: result.error || 'File processing failed',
                    executionTime: result.executionTime,
                    filePath: filePath,
                    script: script
                });
            }
        }
        catch (error) {
            console.error(`[ProcessFile] Exception:`, error);
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    details: error.errors
                });
            }
            res.status(500).json({
                success: false,
                error: error.message || 'Unknown error',
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });
    // 上传 + 运行插值 + 写入 rain_event（使用前端确认日期）
    app.post('/python/rain/process-upload', (req, res) => {
        (0, file_upload_1.uploadSingle)(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ success: false, error: err.message || 'File upload failed' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }
            const confirmedDate = req.body?.confirmed_date;
            const valueThreshold = req.body?.value_threshold;
            if (!confirmedDate) {
                return res.status(400).json({ success: false, error: 'confirmed_date is required (YYYY-MM-DD)' });
            }
            try {
                const fileInfo = (0, file_upload_1.getFileInfo)(req.file, process.cwd());
                const inputFile = fileInfo.path;
                // 与 /python/interpolation 保持一致：自动解析默认 GeoJSON 与 LAU 数据源
                const { getGeoFileDir } = await Promise.resolve().then(() => __importStar(require('./config')));
                const geoFileDir = getGeoFileDir();
                const fs = await Promise.resolve().then(() => __importStar(require('fs')));
                const pathMod = await Promise.resolve().then(() => __importStar(require('path')));
                // 默认域 GeoJSON（从新位置读取）
                let geojsonPath;
                const defaultGeo = pathMod.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson');
                if (fs.existsSync(defaultGeo)) {
                    geojsonPath = defaultGeo;
                }
                // NUTS/LAU 候选（优先请求体覆盖，其次默认，使用新位置）
                const resolveDataPath = (p, subdir) => {
                    if (!p)
                        return undefined;
                    if (pathMod.isAbsolute(p))
                        return p;
                    if (subdir) {
                        return pathMod.join(geoFileDir, subdir, p);
                    }
                    return p;
                };
                const reqNuts = resolveDataPath(req.body?.nuts_file, 'nuts3');
                const reqLau = resolveDataPath(req.body?.lau_file, 'city');
                const nutsCandidates = [
                    reqNuts,
                    pathMod.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.gpkg'),
                    pathMod.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.geojson'),
                    pathMod.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson')
                ].filter(Boolean);
                const lauCandidates = [
                    reqLau,
                    pathMod.join(geoFileDir, 'city', 'LAU_2019.gpkg'),
                    pathMod.join(geoFileDir, 'city', 'LAU_2019.geojson')
                ].filter(Boolean);
                const findFirstExisting = (cands) => cands.find(p => fs.existsSync(p));
                const nuts_file = findFirstExisting(nutsCandidates);
                const lau_file = findFirstExisting(lauCandidates);
                // 调用 Python 插值脚本（传递阈值/域GeoJSON/LAU，并启用每多边形取最大值）
                const result = await (0, service_1.executePythonScriptJSON)('interpolation.py', {
                    input_file: inputFile,
                    value_threshold: valueThreshold ? parseFloat(String(valueThreshold)) : 50.0,
                    max_points: 1000,
                    geojson_file: geojsonPath,
                    take_max_per_polygon: true,
                    nuts_file,
                    lau_file
                }, { timeout: 120000 });
                if (!result.success) {
                    (0, file_upload_1.cleanupFile)(inputFile);
                    return res.status(500).json({ success: false, error: result.error || 'interpolation failed' });
                }
                const data = result.data;
                // Python 返回的结构：{ success: true, summary: {...}, points: [...] }
                const threshold = data?.summary?.value_threshold ?? null;
                const points = Array.isArray(data?.points) ? data.points : [];
                // 批量写入 rain_event（应用层计算 seq 与 id）
                const insertStmt = db_1.db.prepare(`
          INSERT INTO rain_event
          (id, date, country, province, city, longitude, latitude, value, threshold, file_name, seq, searched)
          VALUES (@id, @date, @country, @province, @city, @longitude, @latitude, @value, @threshold, @file_name, @seq, @searched)
        `);
                const tx = db_1.db.transaction((rows) => { rows.forEach(r => insertStmt.run(r)); });
                // 计算每个 (date, province) 的起始 seq（保留旧记录，避免覆盖已搜索的数据）
                const dateStr = String(confirmedDate);
                const ymd = dateStr.replace(/-/g, '');
                // 获取省份名称（用于存储到数据库）：只保留 "/" 前的部分，保留空格
                const getProvinceName = (s) => {
                    const str = s || 'UNKNOWN';
                    // 只保留 "/" 前的英文部分，保留空格
                    return str.split('/')[0].trim();
                };
                // 获取省份名称（用于生成 ID）：只保留 "/" 前的部分，替换空格为下划线
                const getProvinceForId = (s) => {
                    const str = s || 'UNKNOWN';
                    // 只保留 "/" 前的英文部分
                    const beforeSlash = str.split('/')[0].trim();
                    // 替换空格为下划线（用于生成 ID）
                    return beforeSlash.replace(/\s+/g, '_');
                };
                const getMaxSeqStmt = db_1.db.prepare(`SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM rain_event WHERE date = ? AND province = ?`);
                // 检查是否已存在相同记录（date + file_name + longitude + latitude）
                const checkExistsStmt = db_1.db.prepare(`SELECT id FROM rain_event WHERE date = ? AND file_name = ? AND longitude = ? AND latitude = ?`);
                // 先统计各省份数量，查询现有 max seq，只查一次
                const provinceToCount = new Map();
                for (const p of points) {
                    const province = getProvinceName(p.province_name || 'UNKNOWN');
                    provinceToCount.set(province, (provinceToCount.get(province) || 0) + 1);
                }
                const provinceToNextSeq = new Map();
                for (const [province] of provinceToCount) {
                    const row = getMaxSeqStmt.get(dateStr, province);
                    const start = (row?.maxSeq || 0) + 1;
                    provinceToNextSeq.set(province, start);
                }
                // 生成行（带 id/seq），跳过已存在的记录（保留已搜索的数据）
                const rows = [];
                for (const p of points) {
                    const province = getProvinceName(p.province_name || 'UNKNOWN'); // 用于存储到数据库
                    const provinceForId = getProvinceForId(p.province_name || 'UNKNOWN'); // 用于生成 ID
                    const lon = Number(p.longitude);
                    const lat = Number(p.latitude);
                    // 检查是否已存在相同记录（date + file_name + longitude + latitude）
                    const existing = checkExistsStmt.get(dateStr, req.file.originalname, lon, lat);
                    if (existing) {
                        // 已存在，跳过（保留旧记录，包括 searched 状态）
                        continue;
                    }
                    // 不存在，计算 seq 并生成新记录
                    const next = provinceToNextSeq.get(province) || 1;
                    provinceToNextSeq.set(province, next + 1);
                    const seq = next;
                    const id = `${ymd}_${provinceForId}_${seq}`; // 使用替换空格后的版本生成 ID
                    rows.push({
                        id,
                        date: dateStr,
                        country: p.country_name ?? null,
                        province, // 存储保留空格的版本
                        city: p.city_name ?? null,
                        longitude: lon,
                        latitude: lat,
                        value: p.value != null ? Number(p.value) : null,
                        threshold: threshold != null ? Number(threshold) : null,
                        file_name: req.file.originalname,
                        seq,
                        searched: 0
                    });
                }
                tx(rows);
                (0, file_upload_1.cleanupFile)(inputFile);
                // 返回入库结果和插值数据（用于前端显示）
                // data 是 Python 返回的整个对象：{ success: true, summary: {...}, points: [...] }
                return res.json({
                    success: true,
                    inserted: rows.length,
                    data: data // 返回插值结果，包含 points 和 summary
                });
            }
            catch (e) {
                return res.status(500).json({ success: false, error: e?.message || String(e) });
            }
        });
    });
    // 执行Python脚本（返回文本输出）
    app.post('/python/execute', async (req, res) => {
        try {
            const schema = zod_1.z.object({
                script: zod_1.z.string().min(1),
                args: zod_1.z.record(zod_1.z.any()).optional(),
                timeout: zod_1.z.number().optional(),
                python_path: zod_1.z.string().optional()
            });
            const { script, args, timeout, python_path } = schema.parse(req.body);
            const result = await (0, service_1.executePythonScript)(script, args, {
                timeout,
                pythonPath: python_path
            });
            if (result.success) {
                res.json({
                    success: true,
                    output: result.output,
                    error: result.error,
                    executionTime: result.executionTime
                });
            }
            else {
                res.status(500).json({
                    success: false,
                    output: result.output,
                    error: result.error,
                    executionTime: result.executionTime
                });
            }
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    details: error.errors
                });
            }
            res.status(500).json({
                success: false,
                error: error.message || 'Unknown error'
            });
        }
    });
    // 执行Python脚本（返回JSON输出）
    app.post('/python/execute-json', async (req, res) => {
        try {
            const schema = zod_1.z.object({
                script: zod_1.z.string().min(1),
                args: zod_1.z.record(zod_1.z.any()).optional(),
                timeout: zod_1.z.number().optional(),
                python_path: zod_1.z.string().optional()
            });
            const { script, args, timeout, python_path } = schema.parse(req.body);
            const result = await (0, service_1.executePythonScriptJSON)(script, args, {
                timeout,
                pythonPath: python_path
            });
            if (result.success) {
                res.json({
                    success: true,
                    data: result.data,
                    error: result.error,
                    executionTime: result.executionTime
                });
            }
            else {
                res.status(500).json({
                    success: false,
                    data: null,
                    error: result.error,
                    executionTime: result.executionTime
                });
            }
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    details: error.errors
                });
            }
            res.status(500).json({
                success: false,
                error: error.message || 'Unknown error'
            });
        }
    });
    // 空间插值分析接口
    app.post('/python/interpolation', async (req, res) => {
        try {
            const schema = zod_1.z.object({
                filename: zod_1.z.string().optional(),
                fileId: zod_1.z.string().optional(),
                value_threshold: zod_1.z.number().optional(),
                max_points: zod_1.z.number().optional().default(1000),
                geojson_file: zod_1.z.string().optional(),
                take_max_per_polygon: zod_1.z.boolean().optional().default(true),
                timeout: zod_1.z.number().optional()
            });
            const { filename, fileId, value_threshold, max_points, geojson_file, take_max_per_polygon, timeout } = schema.parse(req.body);
            // 查找输入文件
            const { getUploadDir } = await Promise.resolve().then(() => __importStar(require('./config')));
            const uploadDir = getUploadDir();
            let inputFile;
            if (filename) {
                inputFile = path_1.default.join(uploadDir, filename);
            }
            else if (fileId) {
                inputFile = path_1.default.join(uploadDir, fileId);
            }
            else {
                return res.status(400).json({
                    success: false,
                    error: 'Either filename or fileId must be provided'
                });
            }
            // 检查文件是否存在
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            if (!fs.existsSync(inputFile)) {
                return res.status(404).json({
                    success: false,
                    error: `Input file not found: ${inputFile}`
                });
            }
            // 获取地理数据文件目录
            const { getGeoFileDir } = await Promise.resolve().then(() => __importStar(require('./config')));
            const geoFileDir = getGeoFileDir();
            // 查找GeoJSON文件路径（如果提供）
            let geojsonPath;
            if (geojson_file) {
                if (path_1.default.isAbsolute(geojson_file)) {
                    geojsonPath = geojson_file;
                }
                else {
                    // 默认在 apps/uploads/geofile/nuts3/ 目录下
                    geojsonPath = path_1.default.join(geoFileDir, 'nuts3', geojson_file);
                }
                // 检查文件是否存在
                if (!fs.existsSync(geojsonPath)) {
                    return res.status(404).json({
                        success: false,
                        error: `GeoJSON file not found: ${geojsonPath}`
                    });
                }
            }
            else {
                // 如果没有提供，使用默认的GeoJSON文件
                const defaultGeoJSON = path_1.default.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson');
                if (fs.existsSync(defaultGeoJSON)) {
                    geojsonPath = defaultGeoJSON;
                }
            }
            // 查找 NUTS/LAU 数据源（可选，支持多候选与请求体覆盖）
            const resolveDataPath = (p, subdir) => {
                if (!p)
                    return undefined;
                if (path_1.default.isAbsolute(p))
                    return p;
                // 如果指定了子目录，使用新的地理数据目录
                if (subdir) {
                    return path_1.default.join(geoFileDir, subdir, p);
                }
                return p;
            };
            // 允许请求体直接传入（可选）
            const reqNuts = resolveDataPath(req.body.nuts_file, 'nuts3');
            const reqLau = resolveDataPath(req.body.lau_file, 'city');
            // 默认候选列表（使用新的地理数据目录）
            const nutsCandidates = [
                reqNuts,
                path_1.default.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.gpkg'),
                path_1.default.join(geoFileDir, 'nuts3', 'NUTS_RG_20M_2021_4326.geojson'),
                path_1.default.join(geoFileDir, 'nuts3', 'domain_xinyu_20250729_093415.geojson')
            ].filter(Boolean);
            const lauCandidates = [
                reqLau,
                // 使用新位置的 LAU 数据源（优先）
                path_1.default.join(geoFileDir, 'city', 'LAU_2019.gpkg'),
                path_1.default.join(geoFileDir, 'city', 'LAU_2019.geojson')
            ].filter(Boolean);
            const findFirstExisting = (cands) => cands.find(p => fs.existsSync(p));
            const nuts_file = findFirstExisting(nutsCandidates);
            const lau_file = findFirstExisting(lauCandidates);
            // 调用Python脚本
            const result = await (0, service_1.executePythonScriptJSON)('interpolation.py', {
                input_file: inputFile,
                value_threshold: value_threshold || undefined,
                max_points: max_points,
                geojson_file: geojsonPath || undefined,
                take_max_per_polygon: take_max_per_polygon !== false,
                nuts_file,
                lau_file
            }, {
                timeout: timeout || 120000 // 增加超时时间，因为需要处理GeoJSON
            });
            if (result.success) {
                res.json({
                    success: true,
                    data: result.data,
                    executionTime: result.executionTime
                });
            }
            else {
                res.status(500).json({
                    success: false,
                    error: result.error || 'Unknown error occurred',
                    executionTime: result.executionTime
                });
            }
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request body',
                    details: error.errors
                });
            }
            res.status(500).json({
                success: false,
                error: error.message || 'Unknown error'
            });
        }
    });
    // 查询 rain_event 表统计信息
    app.get('/python/rain/stats', (_req, res) => {
        try {
            const total = db_1.db.prepare(`SELECT COUNT(*) AS count FROM rain_event`).get();
            const byDate = db_1.db.prepare(`
        SELECT date, COUNT(*) AS count 
        FROM rain_event 
        GROUP BY date 
        ORDER BY date DESC 
        LIMIT 10
      `).all();
            const byProvince = db_1.db.prepare(`
        SELECT province, COUNT(*) AS count 
        FROM rain_event 
        GROUP BY province 
        ORDER BY count DESC 
        LIMIT 10
      `).all();
            res.json({
                success: true,
                total: total?.count || 0,
                byDate,
                byProvince
            });
        }
        catch (e) {
            res.status(500).json({
                success: false,
                error: e?.message || String(e)
            });
        }
    });
    // 查询 rain_event 表所有数据（支持分页和筛选）
    app.get('/python/rain/list', (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 100;
            const offset = (page - 1) * limit;
            const date = req.query.date;
            const province = req.query.province;
            const country = req.query.country;
            // 构建 WHERE 条件
            const where = [];
            const params = {};
            if (date) {
                where.push('date = @date');
                params.date = date;
            }
            if (province) {
                where.push('province = @province');
                params.province = province;
            }
            if (country) {
                where.push('country = @country');
                params.country = country;
            }
            const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
            // 查询总数
            const countStmt = db_1.db.prepare(`SELECT COUNT(*) AS count FROM rain_event ${whereClause}`);
            const total = (where.length > 0 ? countStmt.get(params) : countStmt.get());
            // 查询数据
            const dataStmt = db_1.db.prepare(`
        SELECT id, date, country, province, city, longitude, latitude, value, threshold, file_name, seq, searched
        FROM rain_event 
        ${whereClause}
        ORDER BY date DESC, seq ASC
        LIMIT @limit OFFSET @offset
      `);
            params.limit = limit;
            params.offset = offset;
            const data = (where.length > 0 ? dataStmt.all(params) : dataStmt.all({ limit, offset }));
            res.json({
                success: true,
                total: total?.count || 0,
                page,
                limit,
                totalPages: Math.ceil((total?.count || 0) / limit),
                data
            });
        }
        catch (e) {
            res.status(500).json({
                success: false,
                error: e?.message || String(e)
            });
        }
    });
    // 查看表2（rain_flood_impact）数据
    app.get('/python/rain/impact/list', (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 100;
            const offset = (page - 1) * limit;
            const date = req.query.date;
            const province = req.query.province;
            const country = req.query.country;
            const level = req.query.level; // 整体级别筛选
            const rain_event_id = req.query.rain_event_id; // 事件ID筛选
            // 构建 WHERE 条件
            const where = [];
            const params = {};
            if (date) {
                where.push('time = @date');
                params.date = date;
            }
            if (province) {
                where.push('province = @province');
                params.province = province;
            }
            if (country) {
                where.push('country = @country');
                params.country = country;
            }
            if (level) {
                const levelNum = parseInt(level);
                if (!isNaN(levelNum)) {
                    where.push('level = @level');
                    params.level = levelNum;
                }
            }
            if (rain_event_id) {
                where.push('rain_event_id = @rain_event_id');
                params.rain_event_id = rain_event_id;
            }
            const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
            // 查询总数
            const countStmt = db_1.db.prepare(`SELECT COUNT(*) AS count FROM rain_flood_impact ${whereClause}`);
            const total = (where.length > 0 ? countStmt.get(params) : countStmt.get());
            // 查询数据
            const dataStmt = db_1.db.prepare(`
        SELECT 
          id, rain_event_id, time, level,
          country, province, city,
          transport_impact_level, economy_impact_level, safety_impact_level,
          timeline_data, source_count, detail_file,
          created_at, updated_at
        FROM rain_flood_impact 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
      `);
            params.limit = limit;
            params.offset = offset;
            const data = (where.length > 0 ? dataStmt.all(params) : dataStmt.all({ limit, offset }));
            // 解析 timeline_data JSON
            const parsedData = data.map(item => ({
                ...item,
                timeline_data: item.timeline_data ? JSON.parse(item.timeline_data) : null
            }));
            res.json({
                success: true,
                total: total?.count || 0,
                page,
                limit,
                totalPages: Math.ceil((total?.count || 0) / limit),
                data: parsedData
            });
        }
        catch (e) {
            res.status(500).json({
                success: false,
                error: e?.message || String(e)
            });
        }
    });
    // 调试：检查路径解析
    app.get('/python/debug/paths', async (_req, res) => {
        try {
            const { getPythonScriptDir, getGeoFileDir } = await Promise.resolve().then(() => __importStar(require('./config')));
            const scriptDir = getPythonScriptDir();
            const geoFileDir = getGeoFileDir();
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            const dataDir = path_1.default.join(scriptDir, 'data');
            const nuts3Dir = path_1.default.join(geoFileDir, 'nuts3');
            const cityDir = path_1.default.join(geoFileDir, 'city');
            // 列出各目录下的文件
            let dataFiles = [];
            let nuts3Files = [];
            let cityFiles = [];
            if (fs.existsSync(dataDir)) {
                dataFiles = fs.readdirSync(dataDir);
            }
            if (fs.existsSync(nuts3Dir)) {
                nuts3Files = fs.readdirSync(nuts3Dir);
            }
            if (fs.existsSync(cityDir)) {
                cityFiles = fs.readdirSync(cityDir);
            }
            res.json({
                success: true,
                debug: {
                    __dirname: __dirname,
                    cwd: process.cwd(),
                    scriptDir,
                    scriptDirExists: fs.existsSync(scriptDir),
                    dataDir,
                    dataDirExists: fs.existsSync(dataDir),
                    dataFiles: dataFiles.slice(0, 10),
                    geoFileDir,
                    geoFileDirExists: fs.existsSync(geoFileDir),
                    nuts3Dir,
                    nuts3DirExists: fs.existsSync(nuts3Dir),
                    nuts3Files: nuts3Files.slice(0, 10),
                    cityDir,
                    cityDirExists: fs.existsSync(cityDir),
                    cityFiles: cityFiles.slice(0, 10)
                }
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    // 读取GeoJSON文件接口
    app.get('/python/geojson/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            // 检查文件名安全性
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid filename'
                });
            }
            // 构建文件路径（在新位置 apps/uploads/geofile/nuts3/ 目录下）
            const { getGeoFileDir } = await Promise.resolve().then(() => __importStar(require('./config')));
            const geoFileDir = getGeoFileDir();
            const geojsonPath = path_1.default.join(geoFileDir, 'nuts3', filename);
            console.log(`[GeoJSON] Request for: ${filename}`);
            console.log(`[GeoJSON] Geo file dir: ${geoFileDir}`);
            console.log(`[GeoJSON] Full path: ${geojsonPath}`);
            // 检查文件是否存在
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            if (!fs.existsSync(geojsonPath)) {
                console.error(`[GeoJSON] File not found: ${geojsonPath}`);
                console.error(`[GeoJSON] Geo file dir exists: ${fs.existsSync(geoFileDir)}`);
                console.error(`[GeoJSON] NUTS3 dir exists: ${fs.existsSync(path_1.default.join(geoFileDir, 'nuts3'))}`);
                // 尝试列出 nuts3 目录下的文件
                const nuts3Dir = path_1.default.join(geoFileDir, 'nuts3');
                let availableFiles = [];
                if (fs.existsSync(nuts3Dir)) {
                    availableFiles = fs.readdirSync(nuts3Dir);
                }
                return res.status(404).json({
                    success: false,
                    error: `GeoJSON file not found: ${filename}`,
                    debug: {
                        geoFileDir,
                        geojsonPath,
                        geoFileDirExists: fs.existsSync(geoFileDir),
                        nuts3DirExists: fs.existsSync(nuts3Dir),
                        availableFiles: availableFiles.slice(0, 10) // 只显示前10个文件
                    }
                });
            }
            // 读取并返回GeoJSON文件
            console.log(`[GeoJSON] Reading file: ${geojsonPath}`);
            const geojsonContent = fs.readFileSync(geojsonPath, 'utf-8');
            const geojsonData = JSON.parse(geojsonContent);
            res.json({
                success: true,
                data: geojsonData
            });
        }
        catch (error) {
            console.error(`[GeoJSON] Error reading file:`, error);
            res.status(500).json({
                success: false,
                error: error.message || 'Unknown error'
            });
        }
    });
}
