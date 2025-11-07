"""LLM 客户端 - 支持 OpenAI 和 Gemini。"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal, Optional

from ..config.settings import Settings, settings

logger = logging.getLogger(__name__)


class LLMClient(ABC):
    """LLM 客户端抽象基类。"""

    @abstractmethod
    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4000,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        """发送聊天请求并返回响应。"""
        pass

    @abstractmethod
    def parse_json_response(self, response: str) -> Dict[str, Any]:
        """解析 JSON 格式的响应。"""
        pass


class OpenAIClient(LLMClient):
    """OpenAI API 客户端。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.api_key = self.config.OPENAI_API_KEY
        self.base_url = self.config.OPENAI_BASE_URL or "https://api.openai.com/v1"
        self.model = self.config.OPENAI_MODEL

        if not self.api_key:
            raise ValueError("OpenAI API Key 未配置")

        try:
            import openai

            self.client = openai.OpenAI(
                api_key=self.api_key,
                base_url=self.base_url if self.base_url != "https://api.openai.com/v1" else None,
            )
        except ImportError:
            raise ImportError("请安装 openai 库: pip install openai")

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4000,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        """发送聊天请求。"""
        try:
            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }

            # OpenAI 支持 JSON 模式
            if response_format:
                kwargs["response_format"] = response_format

            response = self.client.chat.completions.create(**kwargs)
            
            # 记录 token 使用量（如果可用）
            if hasattr(response, "usage") and response.usage:
                usage = response.usage
                logger.info(
                    "OpenAI Token 使用: 输入=%s, 输出=%s, 总计=%s",
                    usage.prompt_tokens,
                    usage.completion_tokens,
                    usage.total_tokens,
                )
                # 计算成本（gpt-4o-mini）
                cost = (usage.prompt_tokens / 1_000_000 * 0.15) + (
                    usage.completion_tokens / 1_000_000 * 0.60
                )
                logger.info("  预估成本: $%.6f", cost)
            
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error("OpenAI API 调用失败: %s", e)
            raise

    def parse_json_response(self, response: str) -> Dict[str, Any]:
        """解析 JSON 响应。"""
        try:
            # 尝试提取 JSON 代码块
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                response = response[start:end].strip()
            elif "```" in response:
                start = response.find("```") + 3
                end = response.find("```", start)
                response = response[start:end].strip()

            return json.loads(response)
        except json.JSONDecodeError:
            logger.warning("无法解析 JSON 响应，尝试直接解析")
            try:
                return json.loads(response)
            except json.JSONDecodeError:
                logger.error("JSON 解析失败: %s", response[:200])
                return {}


class GeminiClient(LLMClient):
    """Google Gemini API 客户端（使用新的 google.genai API）。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.api_key = self.config.GEMINI_API_KEY
        self.model = self.config.GEMINI_MODEL

        if not self.api_key:
            raise ValueError("Gemini API Key 未配置")

        try:
            from google import genai

            self.genai = genai
            self.client = genai.Client(api_key=self.api_key)
        except ImportError:
            raise ImportError("请安装 google-genai 库: pip install google-genai")

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4000,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> str:
        """发送聊天请求。"""
        try:
            # 将 messages 转换为 Gemini 格式
            # 新 API 使用 contents 参数，可以是字符串或消息列表
            prompt = ""
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "system":
                    prompt += f"System: {content}\n\n"
                elif role == "user":
                    prompt += f"User: {content}\n\n"
                elif role == "assistant":
                    prompt += f"Assistant: {content}\n\n"

            # 添加 JSON 格式要求（更明确）
            if response_format:
                prompt += "\n\n【重要要求】\n"
                prompt += "1. 必须以纯 JSON 格式返回结果\n"
                prompt += "2. 不要包含任何代码块标记（如 ```json 或 ```）\n"
                prompt += "3. 不要包含任何解释性文字\n"
                prompt += "4. 直接返回 JSON 对象，确保格式完全正确\n"
                prompt += "5. 所有字符串必须使用双引号\n"
                prompt += "6. 确保 JSON 可以直接被解析，不要有任何语法错误\n\n"

            # 使用新的 API 调用方式
            # 注意：Gemini 2.5 Flash 的 max_output_tokens 限制可能是 8192
            # 如果输入token太多，实际可用输出token会减少
            # 因此我们记录输入长度以便调试
            prompt_length = len(prompt)
            estimated_input_tokens = prompt_length // 4  # 粗略估算：4字符≈1token
            logger.debug(
                "Gemini 请求: 输入长度=%s 字符, 估算输入token≈%s, max_output_tokens=%s",
                prompt_length,
                estimated_input_tokens,
                max_tokens,
            )
            
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config={
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                },
            )

            # 获取响应文本
            response_text = ""
            
            # 方式1: 直接使用 response.text（如果它是属性或方法）
            if hasattr(response, "text"):
                try:
                    # text 可能是属性或方法
                    text_value = response.text
                    if callable(text_value):
                        response_text = text_value() or ""
                    else:
                        response_text = text_value or ""
                    if response_text:
                        logger.debug("从 response.text 获取到文本，长度: %s 字符", len(response_text))
                except Exception as e:
                    logger.debug("response.text 访问失败: %s", e)
            
            # 方式2: 从 response.parts 获取（如果存在）
            if not response_text and hasattr(response, "parts") and response.parts:
                try:
                    parts_text = []
                    for part in response.parts:
                        if hasattr(part, "text") and part.text:
                            parts_text.append(part.text)
                    if parts_text:
                        response_text = "".join(parts_text)
                        logger.debug("从 response.parts 获取到文本，长度: %s 字符", len(response_text))
                except Exception as e:
                    logger.debug("response.parts 访问失败: %s", e)
            
            # 方式3: 从 candidates 中获取
            if not response_text and hasattr(response, "candidates") and response.candidates:
                candidate = response.candidates[0]
                
                # 检查 finish_reason
                if hasattr(candidate, "finish_reason"):
                    finish_reason = candidate.finish_reason
                    if finish_reason:
                        finish_reason_str = str(finish_reason)
                        if "MAX_TOKENS" in finish_reason_str:
                            logger.warning("⚠️ 响应因达到最大 token 限制而被截断，但会尝试提取已生成的部分")
                        elif "SAFETY" in finish_reason_str:
                            logger.warning("⚠️ 响应因安全过滤器被阻止")
                        elif finish_reason_str != "STOP":
                            logger.warning("⚠️ finish_reason: %s", finish_reason_str)
                
                # 从 candidate.content.parts 获取
                if hasattr(candidate, "content") and candidate.content:
                    if hasattr(candidate.content, "parts") and candidate.content.parts:
                        parts_text = []
                        for part in candidate.content.parts:
                            if hasattr(part, "text") and part.text:
                                parts_text.append(part.text)
                        if parts_text:
                            response_text = "".join(parts_text)
                            logger.debug("从 candidate.content.parts 获取到文本，长度: %s 字符", len(response_text))
            
            # 如果仍然为空，记录详细信息用于调试
            if not response_text:
                logger.error("❌ 无法从 Gemini 响应中提取文本")
                logger.error("response 对象详情:")
                logger.error("  - 类型: %s", type(response))
                if hasattr(response, "candidates") and response.candidates:
                    candidate = response.candidates[0]
                    logger.error("  - finish_reason: %s", getattr(candidate, "finish_reason", "N/A"))
                    logger.error("  - safety_ratings: %s", getattr(candidate, "safety_ratings", "N/A"))
                    if hasattr(candidate, "content") and candidate.content:
                        logger.error("  - content.parts: %s", getattr(candidate.content, "parts", "N/A"))
            else:
                # 即使被截断，也记录警告
                if hasattr(response, "candidates") and response.candidates:
                    candidate = response.candidates[0]
                    if hasattr(candidate, "finish_reason"):
                        finish_reason = str(candidate.finish_reason)
                        if "MAX_TOKENS" in finish_reason:
                            logger.warning("⚠️ 响应被截断（达到最大 token 限制），但已提取 %s 字符的文本", len(response_text))
            
            # 记录使用量（如果 API 返回）
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                usage = response.usage_metadata
                prompt_tokens = getattr(usage, "prompt_token_count", 0)
                candidates_tokens = getattr(usage, "candidates_token_count", 0)
                total_tokens = getattr(usage, "total_token_count", 0)
                
                # 计算验证：total 应该等于 prompt + candidates（如果API正确返回）
                calculated_total = prompt_tokens + candidates_tokens
                
                logger.info(
                    "Gemini Token 使用: 输入=%s, 输出=%s, 总计=%s (API返回) / %s (计算值)",
                    prompt_tokens,
                    candidates_tokens,
                    total_tokens,
                    calculated_total,
                )
                
                # 如果API返回的total与计算值不一致，记录警告
                if total_tokens != calculated_total and total_tokens > 0:
                    logger.debug(
                        "⚠️ API返回的total_token_count (%s) 与计算值 (%s) 不一致，可能包含其他token（如缓存、系统提示等）",
                        total_tokens,
                        calculated_total,
                    )
            else:
                # 简单估算（约 4 字符 = 1 token）
                estimated_prompt = len(prompt) // 4
                estimated_completion = len(response_text) // 4 if response_text else 0
                logger.info(
                    "Gemini Token 估算: 输入≈%s, 输出≈%s, 总计≈%s",
                    estimated_prompt,
                    estimated_completion,
                    estimated_prompt + estimated_completion,
                )

            return response_text
        except Exception as e:
            logger.error("Gemini API 调用失败: %s", e)
            raise

    def parse_json_response(self, response: str) -> Dict[str, Any]:
        """解析 JSON 响应（带详细日志）。"""
        logger.debug("=" * 60)
        logger.debug("开始解析 JSON 响应")
        logger.debug("原始响应长度: %s 字符", len(response) if response else 0)
        
        if not response:
            logger.warning("响应为空，返回空字典")
            return {}
        
        # 记录原始响应的前500字符（用于调试）
        logger.debug("原始响应前500字符:\n%s", response[:500] if len(response) > 500 else response)
        
        original_response = response
        step = 1
        
        # 步骤1: 尝试提取 JSON 代码块
        logger.debug("步骤 %d: 检查是否包含 JSON 代码块", step)
        if "```json" in response:
            logger.debug("  发现 ```json 标记")
            start = response.find("```json") + 7
            end = response.find("```", start)
            if end > start:
                extracted = response[start:end].strip()
                logger.debug("  提取到 JSON 代码块，长度: %s 字符", len(extracted))
                logger.debug("  提取内容前200字符: %s", extracted[:200])
                response = extracted
            else:
                # 如果没有找到结束标记，可能是被截断了，尝试提取到文件末尾
                logger.debug("  未找到结束标记 ```，可能被截断，尝试提取到文件末尾")
                extracted = response[start:].strip()
                # 移除可能的尾部不完整内容
                if extracted:
                    # 尝试找到最后一个完整的 }
                    last_brace = extracted.rfind("}")
                    if last_brace > 0:
                        extracted = extracted[:last_brace + 1]
                    response = extracted
                    logger.debug("  提取到部分 JSON 代码块，长度: %s 字符", len(extracted))
        elif "```" in response:
            logger.debug("  发现 ``` 标记（非json）")
            start = response.find("```") + 3
            end = response.find("```", start)
            if end > start:
                extracted = response[start:end].strip()
                logger.debug("  提取到代码块，长度: %s 字符", len(extracted))
                logger.debug("  提取内容前200字符: %s", extracted[:200])
                response = extracted
            else:
                # 如果没有找到结束标记，可能是被截断了
                logger.debug("  未找到结束标记 ```，可能被截断，尝试提取到文件末尾")
                extracted = response[start:].strip()
                if extracted:
                    last_brace = extracted.rfind("}")
                    if last_brace > 0:
                        extracted = extracted[:last_brace + 1]
                    response = extracted
                    logger.debug("  提取到部分代码块，长度: %s 字符", len(extracted))
        else:
            logger.debug("  未发现代码块标记，使用原始响应")
        
        step += 1
        
        # 步骤2: 尝试直接解析
        logger.debug("步骤 %d: 尝试直接解析 JSON", step)
        try:
            result = json.loads(response)
            logger.info("✅ JSON 解析成功（直接解析）")
            logger.debug("解析结果键: %s", list(result.keys()) if isinstance(result, dict) else "非字典类型")
            return result
        except json.JSONDecodeError as e:
            logger.debug("  直接解析失败: %s", str(e))
            logger.debug("  错误位置: 行 %s, 列 %s", e.lineno if hasattr(e, 'lineno') else 'N/A', e.colno if hasattr(e, 'colno') else 'N/A')
        
        step += 1
        
        # 步骤3: 清理响应后解析（处理被截断的情况）
        logger.debug("步骤 %d: 清理响应后解析", step)
        try:
            cleaned = original_response.strip()
            
            # 移除可能的markdown代码块标记
            if cleaned.startswith("```"):
                logger.debug("  移除开头的 ``` 标记")
                lines = cleaned.split("\n")
                if len(lines) > 2:
                    cleaned = "\n".join(lines[1:-1])
                    logger.debug("  移除首尾行后，长度: %s 字符", len(cleaned))
                elif len(lines) == 2:
                    # 只有开始标记，没有结束标记（被截断）
                    cleaned = lines[1]
                    logger.debug("  检测到被截断的代码块，移除开始标记")
            
            # 尝试找到第一个 { 和最后一个 }
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            logger.debug("  查找 JSON 边界: 第一个 { 在位置 %s, 最后一个 } 在位置 %s", first_brace, last_brace)
            
            if first_brace >= 0 and last_brace > first_brace:
                cleaned = cleaned[first_brace:last_brace + 1]
                logger.debug("  提取 JSON 片段，长度: %s 字符", len(cleaned))
                logger.debug("  提取内容前200字符: %s", cleaned[:200])
                
                result = json.loads(cleaned)
                logger.info("✅ JSON 解析成功（清理后解析）")
                logger.debug("解析结果键: %s", list(result.keys()) if isinstance(result, dict) else "非字典类型")
                return result
            elif first_brace >= 0:
                # 有开始但没有结束（被截断），尝试修复
                logger.debug("  检测到被截断的 JSON（有 { 但没有 }），尝试修复")
                cleaned = cleaned[first_brace:]
                # 尝试补全缺失的闭合括号
                open_count = cleaned.count("{")
                close_count = cleaned.count("}")
                missing_closes = open_count - close_count
                if missing_closes > 0:
                    # 尝试找到最后一个完整的对象/数组
                    # 简单策略：从后往前，找到最后一个完整的键值对
                    lines = cleaned.split("\n")
                    fixed_lines = []
                    for line in lines:
                        fixed_lines.append(line)
                        # 如果这一行看起来完整（有逗号或闭合），继续
                        if line.strip().endswith(",") or line.strip().endswith("}"):
                            continue
                    # 添加缺失的闭合括号
                    for _ in range(missing_closes):
                        fixed_lines.append("}")
                    cleaned = "\n".join(fixed_lines)
                    logger.debug("  尝试修复后的 JSON，长度: %s 字符", len(cleaned))
                    try:
                        result = json.loads(cleaned)
                        logger.info("✅ JSON 解析成功（修复截断后解析）")
                        logger.debug("解析结果键: %s", list(result.keys()) if isinstance(result, dict) else "非字典类型")
                        return result
                    except json.JSONDecodeError:
                        logger.debug("  修复后仍然无法解析")
            else:
                logger.debug("  未找到有效的 JSON 边界")
        except json.JSONDecodeError as e:
            logger.debug("  清理后解析失败: %s", str(e))
        
        step += 1
        
        # 步骤4: 尝试修复常见的 JSON 问题
        logger.debug("步骤 %d: 尝试修复常见 JSON 问题", step)
        try:
            # 移除可能的注释
            lines = original_response.split("\n")
            cleaned_lines = []
            for line in lines:
                # 移除行尾注释（// 或 #）
                if "//" in line:
                    line = line[:line.index("//")]
                if "#" in line and not line.strip().startswith("#"):
                    # 只移除行中的 #，保留字符串中的 #
                    pass
                cleaned_lines.append(line)
            cleaned = "\n".join(cleaned_lines)
            
            # 再次尝试找到 JSON 边界
            first_brace = cleaned.find("{")
            last_brace = cleaned.rfind("}")
            if first_brace >= 0 and last_brace > first_brace:
                cleaned = cleaned[first_brace:last_brace + 1]
                result = json.loads(cleaned)
                logger.info("✅ JSON 解析成功（修复后解析）")
                logger.debug("解析结果键: %s", list(result.keys()) if isinstance(result, dict) else "非字典类型")
                return result
        except (json.JSONDecodeError, Exception) as e:
            logger.debug("  修复后解析失败: %s", str(e))
        
        # 所有方法都失败
        logger.error("❌ JSON 解析失败，所有方法都尝试过了")
        logger.error("原始响应前500字符:\n%s", original_response[:500] if len(original_response) > 500 else original_response)
        logger.debug("完整响应:\n%s", original_response)
        logger.debug("=" * 60)
        return {}


def create_llm_client(config: Settings | None = None) -> LLMClient:
    """根据配置创建 LLM 客户端。"""
    config = config or settings

    provider = config.LLM_PROVIDER.lower()

    if provider == "openai":
        return OpenAIClient(config)
    elif provider == "gemini":
        return GeminiClient(config)
    else:
        raise ValueError(f"不支持的 LLM 提供商: {provider}")

