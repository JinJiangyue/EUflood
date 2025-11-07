#!/usr/bin/env python3
"""测试 API Key 配置脚本。

用于验证 .env 文件中的 API Key 是否正确配置并可用。
"""

import logging
import os
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))

from search.config.settings import settings

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def test_tavily_api():
    """测试 Tavily API Key。"""
    logger.info("=" * 60)
    logger.info("测试 Tavily API")
    logger.info("=" * 60)
    
    api_key = settings.TAVILY_API_KEY
    if not api_key or api_key == "your_tavily_api_key_here":
        logger.error("❌ Tavily API Key 未配置")
        logger.info("  请在 .env 文件中设置: TAVILY_API_KEY=你的密钥")
        return False
    
    logger.info("✓ API Key 已配置: %s...%s", api_key[:8], api_key[-4:])
    
    # 测试 API 调用
    try:
        # 优先使用官方 SDK
        try:
            from tavily import TavilyClient
            logger.info("  使用官方 SDK 测试...")
            client = TavilyClient(api_key)
            response = client.search(query="test", max_results=1)
            
            if response and "results" in response:
                logger.info("✓ Tavily API 调用成功（使用官方 SDK）")
                logger.info("  返回结果数量: %s", len(response.get("results", [])))
                return True
            else:
                logger.warning("⚠️  Tavily SDK 返回异常响应")
                return False
                
        except ImportError:
            logger.info("  官方 SDK 未安装，使用 REST API 测试...")
            logger.info("  提示: 安装官方 SDK 可获得更好的体验: pip install tavily-python")
            import requests
            
            # 使用 x-api-key header（标准方式）
            response = requests.post(
                "https://api.tavily.com/search",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                },
                json={
                    "query": "test",
                    "max_results": 1,
                },
                timeout=10,
            )
            
            if response.status_code == 200:
                logger.info("✓ Tavily API 调用成功（使用 REST API）")
                data = response.json()
                logger.info("  返回结果数量: %s", len(data.get("results", [])))
                return True
            elif response.status_code == 401:
                logger.error("❌ Tavily API Key 无效（401 Unauthorized）")
                logger.info("  请检查 API Key 是否正确")
                logger.info("  提示: 建议安装官方 SDK: pip install tavily-python")
                return False
            else:
                logger.warning("⚠️  Tavily API 返回状态码: %s", response.status_code)
                try:
                    error_data = response.json()
                    logger.warning("  错误信息: %s", error_data)
                except Exception:
                    logger.warning("  响应内容: %s", response.text[:200])
                return False
            
    except Exception as e:
        logger.exception("❌ Tavily API 测试失败: %s", e)
        return False


def test_thenewsapi():
    """测试 The News API Key。"""
    logger.info("=" * 60)
    logger.info("测试 The News API")
    logger.info("=" * 60)
    
    api_key = settings.THENEWSAPI_KEY
    if not api_key or api_key == "your_thenewsapi_key_here":
        logger.error("❌ The News API Key 未配置")
        logger.info("  请在 .env 文件中设置: THENEWSAPI_KEY=你的密钥")
        return False
    
    logger.info("✓ API Key 已配置: %s...%s", api_key[:8], api_key[-4:])
    
    # 测试 API 调用
    try:
        import requests
        
        response = requests.get(
            "https://api.thenewsapi.com/v1/news/all",
            params={
                "api_token": api_key,
                "search": "test",
                "limit": 1,
            },
            timeout=10,
        )
        
        if response.status_code == 200:
            logger.info("✓ The News API 调用成功")
            data = response.json()
            logger.info("  返回结果数量: %s", len(data.get("data", [])))
            return True
        elif response.status_code == 401:
            logger.error("❌ The News API Key 无效（401 Unauthorized）")
            logger.info("  请检查 API Key 是否正确")
            return False
        else:
            logger.warning("⚠️  The News API 返回状态码: %s", response.status_code)
            try:
                error_data = response.json()
                logger.warning("  错误信息: %s", error_data)
            except Exception:
                logger.warning("  响应内容: %s", response.text[:200])
            return False
            
    except Exception as e:
        logger.exception("❌ The News API 测试失败: %s", e)
        return False


def test_youtube_api():
    """测试 YouTube API Key。"""
    logger.info("=" * 60)
    logger.info("测试 YouTube Data API")
    logger.info("=" * 60)
    
    api_key = settings.YOUTUBE_API_KEY
    if not api_key or api_key == "your_youtube_api_key_here":
        logger.error("❌ YouTube API Key 未配置")
        logger.info("  请在 .env 文件中设置: YOUTUBE_API_KEY=你的密钥")
        return False
    
    logger.info("✓ API Key 已配置: %s...%s", api_key[:8], api_key[-4:])
    
    # 测试 API 调用
    try:
        import requests
        
        response = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "key": api_key,
                "q": "test",
                "part": "snippet",
                "maxResults": 1,
                "type": "video",
            },
            timeout=10,
        )
        
        if response.status_code == 200:
            logger.info("✓ YouTube API 调用成功")
            data = response.json()
            logger.info("  返回结果数量: %s", len(data.get("items", [])))
            return True
        elif response.status_code == 400:
            logger.error("❌ YouTube API Key 无效或请求参数错误（400 Bad Request）")
            try:
                error_data = response.json()
                logger.error("  错误信息: %s", error_data.get("error", {}).get("message", ""))
            except Exception:
                pass
            return False
        elif response.status_code == 403:
            logger.error("❌ YouTube API Key 无效或配额已用完（403 Forbidden）")
            logger.info("  请检查 API Key 是否正确，或是否启用了 YouTube Data API v3")
            return False
        else:
            logger.warning("⚠️  YouTube API 返回状态码: %s", response.status_code)
            try:
                error_data = response.json()
                logger.warning("  错误信息: %s", error_data)
            except Exception:
                logger.warning("  响应内容: %s", response.text[:200])
            return False
            
    except Exception as e:
        logger.exception("❌ YouTube API 测试失败: %s", e)
        return False


def main():
    """主函数。"""
    logger.info("=" * 60)
    logger.info("API Key 配置检测")
    logger.info("=" * 60)
    logger.info("配置文件路径: %s", settings.model_config.get("env_file", "未找到"))
    logger.info("=" * 60)
    
    results = {
        "Tavily": test_tavily_api(),
        "The News API": test_thenewsapi(),
        "YouTube": test_youtube_api(),
    }
    
    logger.info("=" * 60)
    logger.info("测试结果汇总")
    logger.info("=" * 60)
    
    for name, success in results.items():
        status = "✓ 通过" if success else "❌ 失败"
        logger.info("%s: %s", name, status)
    
    all_passed = all(results.values())
    
    if all_passed:
        logger.info("=" * 60)
        logger.info("🎉 所有 API Key 配置正确！")
        logger.info("=" * 60)
        return 0
    else:
        logger.info("=" * 60)
        logger.warning("⚠️  部分 API Key 配置有问题，请检查上述错误信息")
        logger.info("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())

