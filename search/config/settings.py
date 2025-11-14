"""搜索管线配置模块。

参考 BettaFish 的配置设计，使用 ``pydantic-settings`` 从环境变量或
``.env`` 文件加载参数，集中管理数据库、任务调度、外部 API 等依赖。

所有配置项均提供默认占位值，实际部署时请在根目录放置 ``.env``，或
通过嵌入式 Python 的启动脚本设置环境变量。
"""

from pathlib import Path
from typing import Literal, Optional
import os

from pydantic import Field
from pydantic_settings import BaseSettings


PROJECT_ROOT = Path(__file__).resolve().parents[2]
# 使用根目录的 .env 作为统一配置文件
DEFAULT_ENV_PATH = PROJECT_ROOT / ".env"

# 如果 .env 文件存在但编码有问题，尝试修复
if DEFAULT_ENV_PATH.exists():
    try:
        # 尝试读取文件，检查编码
        with open(DEFAULT_ENV_PATH, 'r', encoding='utf-8') as f:
            f.read()
    except UnicodeDecodeError:
        # 如果 UTF-8 解码失败，尝试用 latin-1 读取并转换为 UTF-8
        try:
            with open(DEFAULT_ENV_PATH, 'rb') as f:
                raw_data = f.read()
            # 尝试用 latin-1 解码（可以解码任何字节），然后重新编码为 UTF-8
            decoded = raw_data.decode('latin-1')
            # 将修复后的内容写回（使用 UTF-8）
            with open(DEFAULT_ENV_PATH, 'w', encoding='utf-8', newline='\n') as f:
                f.write(decoded)
            import logging
            logging.getLogger(__name__).warning(f"⚠️  已修复 .env 文件编码问题（从 latin-1 转换为 UTF-8）")
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"⚠️  无法修复 .env 文件编码: {e}")


class Settings(BaseSettings):
    """搜索管线全局配置。"""

    # ---------------------- 基础运行参数 ----------------------
    ENV: str = Field("development", description="运行环境标识，例如 development / production")
    LOG_LEVEL: str = Field("INFO", description="日志级别")

    # ---------------------- 数据库配置 ------------------------
    # 注意：Python 脚本不再直接操作数据库，所有数据库操作由 Node.js 处理
    # 以下配置已废弃，保留仅用于向后兼容
    
    # SQLite 配置（已废弃）
    DB_DIALECT: Literal["sqlite", "mysql", "postgresql"] = Field(
        "sqlite", description="底层数据库类型（已废弃，现在使用 PocketBase）"
    )
    # SQLite 数据库文件路径（已废弃）
    DB_FILE: Optional[str] = Field(None, description="SQLite 数据库文件路径（已废弃，现在使用 PocketBase）")
    DB_HOST: str = Field("127.0.0.1", description="数据库主机（已废弃）")
    DB_PORT: int = Field(3306, description="数据库端口（已废弃）")
    DB_USER: str = Field("search_user", description="数据库用户名（已废弃）")
    DB_PASSWORD: str = Field("search_password", description="数据库密码（已废弃）")
    DB_NAME: str = Field("search_service", description="数据库名称（已废弃）")
    DB_CHARSET: str = Field("utf8mb4", description="数据库字符集（已废弃）")
    RAIN_EVENTS_TABLE: str = Field("rain_event", description="降雨事件原始表名（PocketBase 集合名）")
    REPORT_REGISTRY_TABLE: str = Field("rain_reports", description="处理后报告登记表（已废弃）")
    EVENT_TIME_COLUMN: str = Field("date", description="事件发生时间列名")
    LOCATION_COLUMN: str = Field("city", description="地点名称列名")
    COUNTRY_COLUMN: str = Field("country", description="国家列名")
    LATITUDE_COLUMN: str = Field("latitude", description="纬度列名")
    LONGITUDE_COLUMN: str = Field("longitude", description="经度列名")
    RAINFALL_COLUMN: str = Field("value", description="降雨量列名")
    SEVERITY_COLUMN: str = Field("severity_level", description="事件严重程度列名（可选）")
    DATA_SOURCE_COLUMN: str = Field("file_name", description="数据来源列名")
    PROCESSED_FLAG_COLUMN: str = Field(
        "searched", description="标记事件是否已处理的列名"
    )
    PROCESSED_AT_COLUMN: str = Field(
        "processed_at", description="事件完成处理的时间列名（可选，如果表中有此列）"
    )

    # ---------------------- 任务调度配置 ----------------------
    POLL_INTERVAL_SECONDS: int = Field(
        300,
        description="轮询 rain_events 表的时间间隔（秒）",
    )
    BATCH_LIMIT: int = Field(
        20, description="单次批处理的最大事件数量，避免占用过多资源"
    )
    MIN_RAINFALL_MM: float = Field(
        50.0,
        description="触发后续处理的最低累计降雨量（毫米），可结合事件类型调整",
    )
    MAX_EVENT_LOOKBACK_HOURS: int = Field(
        48, description="从当前时间向前回溯的事件窗口（小时）"
    )
    
    # ---------------------- 搜索时间窗口配置 ----------------------
    NEWS_SEARCH_WINDOW_DAYS: int = Field(
        3, description="新闻搜索时间窗口（天），从事件当天开始向后搜索的天数"
    )
    
    # ---------------------- 预过滤配置 ----------------------
    PRE_FILTER_ENABLED: bool = Field(
        True, description="是否启用预过滤（在交给LLM前进行简单规则判断）"
    )
    PRE_FILTER_MODE: Literal["strict", "loose"] = Field(
        "strict", description="预过滤模式：strict（严格，必须同时满足时间+地点+关键词）或 loose（宽松，满足任意一个）"
    )
    PRE_FILTER_TIME_WINDOW_DAYS: int = Field(
        3, description="预过滤时间窗口（天），只保留事件时间 + N 天内的结果（不包括事件之前的内容）"
    )
    MAX_ITEMS_FOR_LLM_VALIDATION: int = Field(
        10, description="预过滤后交给LLM验证的最大新闻数量（建议5-15，避免token超限）"
    )
    LLM_VALIDATION_TIME_WINDOW_DAYS: int = Field(
        5, description="LLM验证时间窗口（天），用于判断搜索结果是否属于该事件（事件时间 + N 天）"
    )

    # ---------------------- 搜索 API 配置 ---------------------
    TAVILY_API_KEY: Optional[str] = Field(None, description="Tavily 搜索 API 密钥")
    THENEWSAPI_KEY: Optional[str] = Field(None, description="The News API 密钥（替代 GNews/SerpAPI，支持历史数据）")
    GNEWS_API_KEY: Optional[str] = Field(None, description="GNews API 密钥（已弃用，保留兼容）")
    SERPAPI_KEY: Optional[str] = Field(None, description="SerpAPI 搜索密钥（已弃用，保留兼容）")
    YOUTUBE_API_KEY: Optional[str] = Field(None, description="YouTube Data API 密钥")
    X_BEARER_TOKEN: Optional[str] = Field(None, description="X(Twitter) API Bearer Token")
    INSTAGRAM_ACCESS_TOKEN: Optional[str] = Field(
        None, description="Instagram Graph API Access Token（需 Meta App 审核）"
    )
    INSTAGRAM_APP_ID: Optional[str] = Field(None, description="Instagram App ID")
    INSTAGRAM_APP_SECRET: Optional[str] = Field(None, description="Instagram App Secret")
    NEWSAPI_KEY: Optional[str] = Field(None, description="NewsAPI 密钥")

    # ---------------------- LLM 配置 --------------------
    # LLM 提供商选择
    LLM_PROVIDER: Literal["openai", "gemini"] = Field(
        "openai", description="LLM 提供商（openai 或 gemini）"
    )

    # OpenAI 配置
    OPENAI_API_KEY: Optional[str] = Field(None, description="OpenAI API Key")
    OPENAI_BASE_URL: Optional[str] = Field(
        None, description="OpenAI API Base URL（支持自定义，如本地部署）"
    )
    OPENAI_MODEL: str = Field(
        "gpt-4o-mini", description="OpenAI 模型名称（推荐: gpt-4o-mini 或 gpt-4o）"
    )

    # Gemini 配置
    GEMINI_API_KEY: Optional[str] = Field(None, description="Google Gemini API Key")
    GEMINI_MODEL: str = Field(
        "gemini-2.5-flash", description="Gemini 模型名称（推荐: gemini-2.5-flash 或 gemini-2.5-pro）"
    )

    # 通用 LLM 配置
    LLM_TEMPERATURE: float = Field(0.3, description="LLM 温度（越低越确定，推荐 0.3）")
    LLM_MAX_TOKENS: int = Field(8000, description="最大输出 token 数（Gemini 推荐 8000，避免截断）")
    LLM_TIMEOUT: int = Field(60, description="LLM 请求超时时间（秒）")

    # 兼容旧配置（保留）
    TRANSLATOR_API_KEY: Optional[str] = Field(None, description="翻译服务 API Key（已弃用，使用 OPENAI_API_KEY）")
    TRANSLATOR_BASE_URL: Optional[str] = Field(
        None, description="翻译服务 Base URL（已弃用，使用 OPENAI_BASE_URL）"
    )
    TRANSLATOR_MODEL: str = Field(
        "gpt-4o-mini", description="翻译模型（已弃用，使用 OPENAI_MODEL）"
    )
    SUMMARIZER_API_KEY: Optional[str] = Field(
        None, description="摘要 API Key（已弃用，使用 OPENAI_API_KEY 或 GEMINI_API_KEY）"
    )
    SUMMARIZER_BASE_URL: Optional[str] = Field(
        None, description="摘要 Base URL（已弃用，使用 OPENAI_BASE_URL）"
    )
    SUMMARIZER_MODEL: str = Field(
        "gpt-4o-mini", description="摘要模型（已弃用，使用 OPENAI_MODEL 或 GEMINI_MODEL）"
    )

    # ---------------------- 术语与模板 -----------------------
    TERMINOLOGY_FILE: Path = Field(
        PROJECT_ROOT / "search" / "config" / "terminology.json",
        description="国家与官方语言术语表路径",
    )
    # TEMPLATE_DIR 已废弃：现在使用 LLM 直接生成报告，不再使用 Jinja2 模板
    # TEMPLATE_DIR: Path = Field(
    #     PROJECT_ROOT / "search" / "reporting" / "templates",
    #     description="报告模板目录",
    # )

    model_config = {
        "env_file": str(DEFAULT_ENV_PATH),
        "env_file_encoding": "utf-8",  # 使用 UTF-8 编码（文件已在上方自动修复）
        "case_sensitive": False,
        "extra": "ignore",  # 忽略 .env 中未定义的字段（如 Node.js API 的配置）
        # 注意：pydantic-settings 默认优先读取系统环境变量，然后读取 .env 文件
        # 如果系统环境变量中有占位符，会覆盖 .env 文件中的真实值
        # 解决方案：在 Node.js 中传递环境变量时，不要传递占位符值
    }


# 尝试加载配置，如果 .env 文件编码有问题，使用错误处理
import logging
_logger = logging.getLogger(__name__)

try:
    settings = Settings()
except UnicodeDecodeError as e:
    _logger.error(f"⚠️  .env 文件编码错误: {e}")
    _logger.error(f"  文件路径: {DEFAULT_ENV_PATH}")
    _logger.error(f"  错误位置: position {e.start}-{e.end}")
    _logger.error(f"  建议：将 .env 文件保存为 UTF-8 编码（无 BOM）")
    _logger.error(f"  或者检查 .env 文件第 {e.start // 50} 行附近是否有特殊字符")
    # 重新抛出错误，让调用者处理
    raise
except Exception as e:
    _logger.error(f"⚠️  加载配置时出错: {e}")
    raise

# 调试：检查关键配置是否加载
if not settings.TAVILY_API_KEY or settings.TAVILY_API_KEY == "your_tavily_api_key_here":
    _logger.warning("⚠️  TAVILY_API_KEY 未正确加载（值: %s）", 
                   settings.TAVILY_API_KEY[:20] + "..." if settings.TAVILY_API_KEY and len(settings.TAVILY_API_KEY) > 20 else settings.TAVILY_API_KEY)
    _logger.warning("  检查 .env 文件路径: %s", DEFAULT_ENV_PATH)
    _logger.warning("  .env 文件存在: %s", DEFAULT_ENV_PATH.exists())


def reload_settings() -> Settings:
    """重新加载配置，用于运行期热更新。"""

    global settings
    settings = Settings()
    return settings

