"""LLM 处理模块 - 用于智能信息验证、提取和报告生成。"""

from .client import LLMClient, create_llm_client
from .processor import LLMProcessor

__all__ = ["LLMClient", "create_llm_client", "LLMProcessor"]

