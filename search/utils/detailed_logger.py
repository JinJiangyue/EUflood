"""详细日志记录器 - 记录整个搜索流程的详细信息。"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class DetailedLogger:
    """详细日志记录器，记录整个流程并保存到文件。"""

    def __init__(self, output_file: str = "test_log.md"):
        self.output_file = Path(output_file)
        self.log_entries: List[Dict[str, Any]] = []
        self.current_section: Optional[str] = None

    def start_section(self, title: str, description: str = ""):
        """开始一个新的日志部分。"""
        self.current_section = title
        entry = {
            "type": "section_start",
            "title": title,
            "description": description,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("=" * 80)
        logger.info("开始: %s", title)
        if description:
            logger.info("描述: %s", description)
        logger.info("=" * 80)

    def log_input(self, event_data: Dict[str, Any]):
        """记录输入事件数据。"""
        entry = {
            "type": "input",
            "data": event_data,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("📥 输入事件数据:")
        logger.info(json.dumps(event_data, indent=2, ensure_ascii=False))

    def log_search_request(
        self,
        collector_name: str,
        channel: str,
        language: str,
        keywords: List[str],
        payload: Dict[str, Any],
    ):
        """记录搜索请求。"""
        entry = {
            "type": "search_request",
            "collector": collector_name,
            "channel": channel,
            "language": language,
            "keywords": keywords,
            "payload": payload,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("🔍 搜索请求:")
        logger.info("  采集器: %s", collector_name)
        logger.info("  渠道: %s", channel)
        logger.info("  语言: %s", language)
        logger.info("  关键词: %s", ", ".join(keywords))
        logger.info("  请求参数:")
        logger.info(json.dumps(payload, indent=4, ensure_ascii=False))

    def log_pre_filter_results(
        self,
        original_count: int,
        filtered_count: int,
        filter_details: List[Dict[str, Any]],
    ):
        """记录预过滤结果。"""
        entry = {
            "type": "pre_filter",
            "original_count": original_count,
            "filtered_count": filtered_count,
            "removed_count": original_count - filtered_count,
            "filter_details": filter_details,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("🔍 预过滤详情:")
        logger.info("  原始结果: %s 条", original_count)
        logger.info("  过滤后: %s 条", filtered_count)
        logger.info("  移除: %s 条", original_count - filtered_count)
        if filter_details:
            logger.info("  被过滤的项:")
            for detail in filter_details[:10]:  # 最多显示10条
                logger.info("    [%s] %s", detail.get("index", "N/A"), detail.get("title", "N/A")[:80])
                logger.info("       原因: %s", ", ".join(detail.get("reasons", [])))
                logger.info("       检查结果: 时间=%s, 地点=%s, 关键词=%s",
                    "✓" if detail.get("checks", {}).get("time") else "✗",
                    "✓" if detail.get("checks", {}).get("location") else "✗",
                    "✓" if detail.get("checks", {}).get("keyword") else "✗",
                )
            if len(filter_details) > 10:
                logger.info("    ... 还有 %s 条被过滤", len(filter_details) - 10)

    def log_search_response(
        self,
        collector_name: str,
        channel: str,
        language: str,
        response_data: Any,
        items_count: int,
    ):
        """记录搜索响应。"""
        entry = {
            "type": "search_response",
            "collector": collector_name,
            "channel": channel,
            "language": language,
            "items_count": items_count,
            "sample_items": response_data[:3] if isinstance(response_data, list) and len(response_data) > 3 else response_data,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("✅ 搜索响应:")
        logger.info("  采集器: %s", collector_name)
        logger.info("  渠道: %s", channel)
        logger.info("  语言: %s", language)
        logger.info("  结果数量: %s", items_count)
        if items_count > 0:
            logger.info("  示例结果（前3条）:")
            for idx, item in enumerate(response_data[:3], 1):
                logger.info("    [%s] %s", idx, json.dumps(item, indent=6, ensure_ascii=False))

    def log_llm_request(
        self,
        step: str,
        step_number: int,
        provider: str,
        model: str,
        prompt_messages: List[Dict[str, str]],
        config: Dict[str, Any],
    ):
        """记录 LLM 请求。"""
        entry = {
            "type": "llm_request",
            "step": step,
            "step_number": step_number,
            "provider": provider,
            "model": model,
            "prompt_messages": prompt_messages,
            "config": config,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("🤖 LLM 请求 (步骤 %s: %s):", step_number, step)
        logger.info("  提供商: %s", provider)
        logger.info("  模型: %s", model)
        logger.info("  配置: %s", json.dumps(config, indent=4, ensure_ascii=False))
        logger.info("  Prompt 消息:")
        for idx, msg in enumerate(prompt_messages, 1):
            logger.info("    [消息 %s] 角色: %s", idx, msg.get("role", "unknown"))
            content = msg.get("content", "")
            logger.info("    内容长度: %s 字符", len(content))
            logger.info("    内容预览 (前500字符):")
            logger.info("    %s", content[:500] + "..." if len(content) > 500 else content)

    def log_llm_response(
        self,
        step: str,
        step_number: int,
        provider: str,
        raw_response: str,
        parsed_response: Optional[Dict[str, Any]] = None,
        token_usage: Optional[Dict[str, Any]] = None,
    ):
        """记录 LLM 响应。"""
        entry = {
            "type": "llm_response",
            "step": step,
            "step_number": step_number,
            "provider": provider,
            "raw_response_length": len(raw_response) if raw_response else 0,
            "raw_response_preview": raw_response[:500] if raw_response else "",
            "parsed_response": parsed_response,
            "token_usage": token_usage,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("🤖 LLM 响应 (步骤 %s: %s):", step_number, step)
        logger.info("  提供商: %s", provider)
        logger.info("  原始响应长度: %s 字符", len(raw_response) if raw_response else 0)
        if raw_response:
            logger.info("  原始响应预览 (前500字符):")
            logger.info("  %s", raw_response[:500] + "..." if len(raw_response) > 500 else raw_response)
        if parsed_response:
            logger.info("  解析后的响应:")
            logger.info(json.dumps(parsed_response, indent=4, ensure_ascii=False))
        if token_usage:
            logger.info("  Token 使用:")
            logger.info(json.dumps(token_usage, indent=4, ensure_ascii=False))

    def log_processing_step(
        self,
        step_name: str,
        input_data: Any,
        output_data: Any,
        description: str = "",
    ):
        """记录处理步骤。"""
        entry = {
            "type": "processing_step",
            "step_name": step_name,
            "input_data": input_data,
            "output_data": output_data,
            "description": description,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.info("⚙️ 处理步骤: %s", step_name)
        if description:
            logger.info("  描述: %s", description)
        logger.info("  输入数据类型: %s", type(input_data).__name__)
        logger.info("  输出数据类型: %s", type(output_data).__name__)

    def log_error(self, error_type: str, error_message: str, error_details: Any = None):
        """记录错误。"""
        entry = {
            "type": "error",
            "error_type": error_type,
            "error_message": error_message,
            "error_details": error_details,
            "timestamp": datetime.now().isoformat(),
        }
        self.log_entries.append(entry)
        logger.error("❌ 错误: %s", error_type)
        logger.error("  消息: %s", error_message)
        if error_details:
            logger.error("  详情: %s", json.dumps(error_details, indent=4, ensure_ascii=False))

    def save_to_file(self):
        """保存日志到文件。"""
        try:
            with open(self.output_file, "w", encoding="utf-8") as f:
                f.write("# 详细流程日志\n\n")
                f.write(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                f.write("---\n\n")

                for entry in self.log_entries:
                    entry_type = entry.get("type", "unknown")
                    timestamp = entry.get("timestamp", "")

                    if entry_type == "section_start":
                        f.write(f"\n## {entry.get('title', 'Unknown')}\n\n")
                        if entry.get("description"):
                            f.write(f"**描述**: {entry.get('description')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write("---\n\n")

                    elif entry_type == "input":
                        f.write("### 📥 输入事件数据\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write("```json\n")
                        f.write(json.dumps(entry.get("data", {}), indent=2, ensure_ascii=False))
                        f.write("\n```\n\n")
                        f.write("---\n\n")

                    elif entry_type == "search_request":
                        f.write(f"### 🔍 搜索请求: {entry.get('collector', 'Unknown')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write(f"- **采集器**: {entry.get('collector', 'Unknown')}\n")
                        f.write(f"- **渠道**: {entry.get('channel', 'Unknown')}\n")
                        f.write(f"- **语言**: {entry.get('language', 'Unknown')}\n")
                        f.write(f"- **关键词**: {', '.join(entry.get('keywords', []))}\n\n")
                        f.write("**请求参数**:\n\n")
                        f.write("```json\n")
                        f.write(json.dumps(entry.get("payload", {}), indent=2, ensure_ascii=False))
                        f.write("\n```\n\n")
                        f.write("---\n\n")

                    elif entry_type == "pre_filter":
                        f.write(f"### 🔍 预过滤结果\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write(f"- **原始结果**: {entry.get('original_count', 0)} 条\n")
                        f.write(f"- **过滤后**: {entry.get('filtered_count', 0)} 条\n")
                        f.write(f"- **移除**: {entry.get('removed_count', 0)} 条\n\n")
                        if entry.get("filter_details"):
                            f.write(f"**被过滤的项（前10条）**:\n\n")
                            for detail in entry["filter_details"][:10]:
                                f.write(f"#### 项 {detail.get('index', 'N/A')}\n\n")
                                f.write(f"- **标题**: {detail.get('title', 'N/A')}\n")
                                f.write(f"- **URL**: {detail.get('url', 'N/A')}\n")
                                f.write(f"- **原因**: {', '.join(detail.get('reasons', []))}\n")
                                checks = detail.get('checks', {})
                                f.write(f"- **检查结果**:\n")
                                f.write(f"  - 时间匹配: {'✓' if checks.get('time') else '✗'}\n")
                                f.write(f"  - 地点匹配: {'✓' if checks.get('location') else '✗'}\n")
                                f.write(f"  - 关键词匹配: {'✓' if checks.get('keyword') else '✗'}\n")
                                f.write(f"- **模式**: {detail.get('mode', 'N/A')}\n\n")
                            if len(entry["filter_details"]) > 10:
                                f.write(f"*... 还有 {len(entry['filter_details']) - 10} 条被过滤*\n\n")
                        f.write("---\n\n")
                    
                    elif entry_type == "search_response":
                        f.write(f"### ✅ 搜索响应: {entry.get('collector', 'Unknown')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write(f"- **采集器**: {entry.get('collector', 'Unknown')}\n")
                        f.write(f"- **渠道**: {entry.get('channel', 'Unknown')}\n")
                        f.write(f"- **语言**: {entry.get('language', 'Unknown')}\n")
                        f.write(f"- **结果数量**: {entry.get('items_count', 0)}\n\n")
                        if entry.get("items_count", 0) > 0:
                            f.write("**示例结果（前3条）**:\n\n")
                            for idx, item in enumerate(entry.get("sample_items", []), 1):
                                f.write(f"#### 结果 {idx}\n\n")
                                f.write("```json\n")
                                f.write(json.dumps(item, indent=2, ensure_ascii=False))
                                f.write("\n```\n\n")

                    elif entry_type == "llm_request":
                        f.write(f"### 🤖 LLM 请求: 步骤 {entry.get('step_number', '?')} - {entry.get('step', 'Unknown')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write(f"- **提供商**: {entry.get('provider', 'Unknown')}\n")
                        f.write(f"- **模型**: {entry.get('model', 'Unknown')}\n")
                        f.write(f"- **配置**:\n\n")
                        f.write("```json\n")
                        f.write(json.dumps(entry.get("config", {}), indent=2, ensure_ascii=False))
                        f.write("\n```\n\n")
                        f.write("**Prompt 消息**:\n\n")
                        for idx, msg in enumerate(entry.get("prompt_messages", []), 1):
                            f.write(f"#### 消息 {idx}: {msg.get('role', 'unknown')}\n\n")
                            content = msg.get("content", "")
                            f.write(f"**内容长度**: {len(content)} 字符\n\n")
                            f.write("```\n")
                            f.write(content)
                            f.write("\n```\n\n")
                        f.write("---\n\n")

                    elif entry_type == "llm_response":
                        f.write(f"### 🤖 LLM 响应: 步骤 {entry.get('step_number', '?')} - {entry.get('step', 'Unknown')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write(f"- **提供商**: {entry.get('provider', 'Unknown')}\n")
                        f.write(f"- **原始响应长度**: {entry.get('raw_response_length', 0)} 字符\n\n")
                        if entry.get("raw_response_preview"):
                            f.write("**原始响应预览**:\n\n")
                            f.write("```\n")
                            f.write(entry.get("raw_response_preview", ""))
                            f.write("\n```\n\n")
                        if entry.get("parsed_response"):
                            f.write("**解析后的响应**:\n\n")
                            f.write("```json\n")
                            f.write(json.dumps(entry.get("parsed_response", {}), indent=2, ensure_ascii=False))
                            f.write("\n```\n\n")
                        if entry.get("token_usage"):
                            f.write("**Token 使用**:\n\n")
                            f.write("```json\n")
                            f.write(json.dumps(entry.get("token_usage", {}), indent=2, ensure_ascii=False))
                            f.write("\n```\n\n")
                        f.write("---\n\n")

                    elif entry_type == "processing_step":
                        f.write(f"### ⚙️ 处理步骤: {entry.get('step_name', 'Unknown')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        if entry.get("description"):
                            f.write(f"**描述**: {entry.get('description')}\n\n")
                        f.write(f"- **输入数据类型**: {type(entry.get('input_data')).__name__}\n")
                        f.write(f"- **输出数据类型**: {type(entry.get('output_data')).__name__}\n\n")
                        f.write("---\n\n")

                    elif entry_type == "error":
                        f.write(f"### ❌ 错误: {entry.get('error_type', 'Unknown')}\n\n")
                        f.write(f"**时间**: {timestamp}\n\n")
                        f.write(f"**消息**: {entry.get('error_message', 'Unknown')}\n\n")
                        if entry.get("error_details"):
                            f.write("**详情**:\n\n")
                            f.write("```json\n")
                            f.write(json.dumps(entry.get("error_details", {}), indent=2, ensure_ascii=False))
                            f.write("\n```\n\n")
                        f.write("---\n\n")

            logger.info("✅ 详细日志已保存到: %s", self.output_file)
        except Exception as e:
            logger.error("保存日志文件失败: %s", e)


# 全局日志记录器实例
_detailed_logger: Optional[DetailedLogger] = None


def get_detailed_logger(output_file: str = "test_log.md") -> DetailedLogger:
    """获取全局详细日志记录器。"""
    global _detailed_logger
    if _detailed_logger is None:
        _detailed_logger = DetailedLogger(output_file)
    return _detailed_logger


def reset_detailed_logger():
    """重置全局日志记录器（用于测试）。"""
    global _detailed_logger
    _detailed_logger = None

