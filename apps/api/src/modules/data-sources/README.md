# 数据源模块结构

## 目录组织

```
data-sources/
├── open-source/          # 1. 开源数据来源（无需API Key）
│   ├── chmi/            # 捷克气象局
│   ├── smhi/            # 瑞典气象水文局
│   ├── fmi/             # 芬兰气象研究所
│   ├── emhi/            # 爱沙尼亚气象水文研究所
│   └── ...
├── api-key-required/     # 2. 需要API Key的数据来源
│   ├── aemet/           # 西班牙国家气象局
│   └── ...
├── news-websites/        # 3. 新闻网站（RSS）
│   ├── france24/        # France 24
│   ├── ansa/            # ANSA意大利通讯社
│   ├── lemonde/         # Le Monde
│   ├── lefigaro/        # Le Figaro
│   ├── rai/             # RAI意大利广播
│   └── ...
└── social-media/         # 4. 社交媒体
    ├── twitter/         # Twitter/X API
    ├── facebook/        # Facebook Graph API
    └── ...
```

## 每个数据源的模块结构

```
{source-name}/
├── service.ts           # 采集服务逻辑
├── config.ts            # 配置（URL、参数等）
├── parser.ts            # 数据解析器（如RSS XML、JSON等）
├── types.ts             # 类型定义
└── README.md            # 该数据源的使用说明
```

## 统一接口

所有数据源应实现统一的接口：

```typescript
interface DataSource {
  collect(): Promise<FloodRecord[]>;
  validateConfig(): boolean;
  getSourceInfo(): SourceInfo;
}
```

## 数据源注册

在 `routes.ts` 中统一注册所有数据源，支持：
- 单独采集某个数据源
- 批量采集多个数据源
- 定时采集任务

