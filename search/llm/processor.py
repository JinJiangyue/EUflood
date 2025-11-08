"""LLM 处理模块 - 4 个步骤的智能处理。"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..config.settings import Settings, settings
from ..orchestrator.workflow import EventContext
from .client import LLMClient, create_llm_client
from .prompts import (
    build_extraction_prompt,
    build_report_prompt,
    build_validation_prompt,
)

logger = logging.getLogger(__name__)


class LLMProcessor:
    """LLM 处理器 - 4 个步骤的智能处理。"""

    def __init__(self, config: Settings | None = None):
        self.config = config or settings
        self.client: LLMClient | None = None

    def _get_client(self) -> LLMClient:
        """获取或创建 LLM 客户端。"""
        if self.client is None:
            try:
                self.client = create_llm_client(self.config)
                logger.info("LLM 客户端已创建: %s", self.config.LLM_PROVIDER)
            except Exception as e:
                logger.error("创建 LLM 客户端失败: %s", e)
                raise
        return self.client

    def process(self, context: EventContext) -> Dict[str, Any]:
        """执行完整的 LLM 处理流程（4 个步骤）。"""
        try:
            # 准备事件信息
            event_info = self._prepare_event_info(context)

            # 步骤 1: 事件验证和冲突解决
            logger.info("步骤 1: 事件验证和冲突解决...")
            validation_result = self._step1_validation(context, event_info)

            # 检查是否有相关结果
            relevant_items = validation_result.get("relevant_items", [])
            if not relevant_items or len(relevant_items) == 0:
                logger.warning("⚠️  验证完成：0 条相关结果，跳过后续LLM处理以节省成本")
                logger.warning("可能的原因：")
                logger.warning("   1. 预过滤后的结果都不相关")
                logger.warning("   2. LLM判断所有结果都不属于该事件")
                logger.warning("   3. 事件信息与搜索结果不匹配")
                
                # 返回最小结果，不进行后续处理
                return {
                    "validation": validation_result,
                    "extraction": {
                        "timeline": [],
                        "impact": {},
                    },
                    "media": {
                        "selected_items": [],
                        "rejected_items": [],
                    },
                    "report": self._generate_minimal_report_no_relevant(context, event_info),
                }

            # 步骤 2: 时间线和影响提取
            logger.info("步骤 2: 时间线和影响提取...")
            extraction_result = self._step2_extraction(
                context, event_info, validation_result
            )

            # 步骤 3: 从验证结果中提取多媒体（不再单独调用LLM）
            logger.info("步骤 3: 提取验证后的多媒体内容...")
            media_result = self._extract_media_from_validation(validation_result)

            # 步骤 4: 报告生成
            logger.info("步骤 4: 报告生成...")
            report = self._step4_report_generation(
                context, event_info, extraction_result, validation_result, media_result
            )

            return {
                "validation": validation_result,
                "extraction": extraction_result,
                "media": media_result,
                "report": report,
            }
        except Exception as e:
            logger.exception("LLM 处理失败: %s", e)
            raise

    def _pre_filter_results(
        self,
        all_items: List[Dict[str, Any]],
        event_info: Dict[str, Any],
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """预过滤搜索结果，移除明显不相关的结果。
        
        Returns:
            (filtered_items, filter_details): 过滤后的结果列表和过滤详情列表
        """
        from datetime import datetime, timedelta
        
        filtered = []
        filter_details = []  # 记录过滤详情
        event_time_str = event_info.get("event_time", "")
        province = (event_info.get("province", "") or "").lower()
        country = (event_info.get("country", "") or "").lower()
        rain_term = (event_info.get("rain_term", "rain") or "rain").lower()
        flood_term = (event_info.get("flood_term", "flood") or "flood").lower()
        
        # 解析事件时间
        event_time = None
        if event_time_str:
            try:
                event_time = datetime.strptime(event_time_str, "%Y-%m-%d %H:%M:%S")
            except (ValueError, TypeError):
                try:
                    event_time = datetime.fromisoformat(event_time_str.replace("Z", ""))
                except (ValueError, TypeError):
                    pass
        
        time_window_days = self.config.PRE_FILTER_TIME_WINDOW_DAYS
        is_strict = self.config.PRE_FILTER_MODE == "strict"
        
        for idx, item in enumerate(all_items):
            checks = {
                "time": False,
                "location": False,
                "keyword": False,
            }
            reasons = []
            
            # 1. 时间过滤
            if event_time:
                checks["time"] = self._check_time_match(item, event_time, time_window_days)
                if not checks["time"]:
                    reasons.append("时间不匹配")
            else:
                checks["time"] = True  # 如果没有事件时间，跳过时间检查
            
            # 2. 地点过滤
            if province or country:
                checks["location"] = self._check_location_match(item, province, country)
                if not checks["location"]:
                    reasons.append("地点不匹配")
            else:
                checks["location"] = True  # 如果没有地点信息，跳过地点检查
            
            # 3. 关键词过滤
            checks["keyword"] = self._check_keyword_match(item, rain_term, flood_term)
            if not checks["keyword"]:
                reasons.append("关键词不匹配")
            
            # 根据模式决定是否保留
            should_keep = False
            if is_strict:
                # 严格模式：必须同时满足所有条件
                should_keep = all(checks.values())
            else:
                # 宽松模式：满足任意一个条件即可
                should_keep = any(checks.values())
            
            if should_keep:
                filtered.append(item)
            else:
                # 记录被过滤的项
                filter_details.append({
                    "index": idx,
                    "title": item.get("title", "N/A")[:100],  # 限制长度
                    "url": item.get("url", "N/A"),
                    "checks": checks,
                    "reasons": reasons,
                    "mode": "strict" if is_strict else "loose",
                })
        
        return filtered, filter_details
    
    def _pre_filter_with_media_priority(
        self,
        all_items: List[Dict[str, Any]],
        event_info: Dict[str, Any],
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """预过滤搜索结果，媒体优先进入15条（最多3条媒体）。
        
        Returns:
            (filtered_items, filter_details): 过滤后的结果列表（最多15条，媒体优先）和过滤详情列表
        """
        # 1. 分离媒体和新闻
        media_items = [item for item in all_items if item.get("channel") in {"media", "social"}]
        news_items = [item for item in all_items if item.get("channel") not in {"media", "social"}]
        
        # 2. 分别筛选（时间+地点+关键词）
        filtered_media, media_filter_details = self._pre_filter_results(media_items, event_info)
        filtered_news, news_filter_details = self._pre_filter_results(news_items, event_info)
        
        # 3. 媒体优先：最多取3条（如果有）
        selected_media = filtered_media[:3] if len(filtered_media) >= 3 else filtered_media
        
        # 4. 新闻补充：取剩余数量（15 - 媒体数量）
        remaining_count = 15 - len(selected_media)
        selected_news = filtered_news[:remaining_count] if len(filtered_news) >= remaining_count else filtered_news
        
        # 5. 合并（不排序，让LLM1排序）
        filtered_items = selected_media + selected_news
        
        # 6. 合并过滤详情
        all_filter_details = media_filter_details + news_filter_details
        
        logger.info(
            "预过滤完成：媒体 %s 条（优先保留 %s 条），新闻 %s 条，总计 %s 条",
            len(filtered_media),
            len(selected_media),
            len(selected_news),
            len(filtered_items),
        )
        
        return filtered_items, all_filter_details
    
    def _extract_date_from_url(self, url: str) -> Optional[datetime]:
        """从URL中提取日期（常见格式：/2025/10/27/ 或 /2025-10-27/）。"""
        if not url:
            return None
        
        import re
        # 匹配 URL 中的日期格式：/2025/10/27/ 或 /2025-10-27/
        patterns = [
            r'/(\d{4})/(\d{1,2})/(\d{1,2})/',  # /2025/10/27/
            r'/(\d{4})-(\d{1,2})-(\d{1,2})/',  # /2025-10-27/
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                try:
                    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
                    return datetime(year, month, day)
                except (ValueError, TypeError):
                    continue
        
        return None
    
    def _extract_date_from_text(self, text: str) -> Optional[datetime]:
        """从文本中提取日期（常见格式：October 29, 2025 或 10/29/2025）。"""
        if not text:
            return None
        
        import re
        
        month_names = {
            'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
            'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
        }
        
        # 模式1: October 29, 2025 或 Oct 29, 2025
        pattern1 = r'(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})'
        match = re.search(pattern1, text, re.IGNORECASE)
        if match:
            try:
                month_str = match.group(0).split()[0].lower()
                day = int(match.group(1))
                year = int(match.group(2))
                month = month_names.get(month_str)
                if month:
                    return datetime(year, month, day)
            except (ValueError, TypeError, IndexError):
                pass
        
        # 模式2: 2025-10-29
        pattern2 = r'(\d{4})-(\d{1,2})-(\d{1,2})'
        match = re.search(pattern2, text)
        if match:
            try:
                year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
                return datetime(year, month, day)
            except (ValueError, TypeError):
                pass
        
        # 模式3: 10/29/2025 或 10-29-2025（注意：可能是 MM/DD/YYYY 或 DD/MM/YYYY）
        pattern3 = r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})'
        match = re.search(pattern3, text)
        if match:
            try:
                # 尝试 MM/DD/YYYY
                month, day, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
                if 1 <= month <= 12 and 1 <= day <= 31:
                    return datetime(year, month, day)
            except (ValueError, TypeError):
                pass
        
        return None

    def _check_time_match(
        self,
        item: Dict[str, Any],
        event_time: datetime,
        window_days: int,
    ) -> bool:
        """检查时间是否匹配（只保留事件时间 + N 天内的结果）。"""
        published_at = item.get("published_at")
        pub_time = None
        
        # 1. 优先使用 published_at 字段
        if published_at:
            try:
                if isinstance(published_at, str):
                    # 尝试解析ISO格式
                    published_at_clean = published_at.replace("Z", "+00:00")
                    pub_time = datetime.fromisoformat(published_at_clean)
                else:
                    pub_time = published_at
            except (ValueError, TypeError, AttributeError):
                pass
        
        # 2. 如果 published_at 为空，尝试从 URL 中提取日期
        if not pub_time:
            url = item.get("url", "")
            pub_time = self._extract_date_from_url(url)
        
        # 3. 如果 URL 也没有，尝试从标题和摘要中提取日期
        if not pub_time:
            title = item.get("title", "")
            summary = item.get("summary", "") or item.get("description", "")
            text = f"{title} {summary}"
            pub_time = self._extract_date_from_text(text)
        
        # 4. 如果仍然没有日期，保留（让LLM判断）
        if not pub_time:
            return True
        
        try:
            # 转换为UTC（如果有时区信息）
            if pub_time.tzinfo:
                pub_time = pub_time.replace(tzinfo=None)
            if event_time.tzinfo:
                event_time = event_time.replace(tzinfo=None)
            
            # 只保留事件时间之后的内容（事件时间 + N 天内）
            # 发布时间必须在事件时间之后，且在事件时间 + window_days 天内
            if pub_time < event_time:
                return False  # 发布时间在事件时间之前，过滤掉
            
            time_diff = (pub_time - event_time).days
            return time_diff <= window_days
        except (ValueError, TypeError, AttributeError):
            return True  # 解析失败，保留（让LLM判断）
    
    def _check_location_match(
        self,
        item: Dict[str, Any],
        province: str,
        country: str,
    ) -> bool:
        """检查地点是否匹配（标题或摘要中包含省名或国家名）。"""
        title = (item.get("title", "") or "").lower()
        summary = (item.get("summary", "") or item.get("description", "") or "").lower()
        text = f"{title} {summary}"
        
        if province and province in text:
            return True
        if country and country in text:
            return True
        return False
    
    def _check_keyword_match(
        self,
        item: Dict[str, Any],
        rain_term: str,
        flood_term: str,
    ) -> bool:
        """检查关键词是否匹配（标题或摘要中包含灾害关键词）。"""
        title = (item.get("title", "") or "").lower()
        summary = (item.get("summary", "") or item.get("description", "") or "").lower()
        text = f"{title} {summary}"
        
        if rain_term and rain_term in text:
            return True
        if flood_term and flood_term in text:
            return True
        return False
    
    def _prepare_event_info(self, context: EventContext) -> Dict[str, Any]:
        """准备事件信息。"""
        event = context.rain_event
        profile = context.location_profile or {}

        return {
            "event_id": event.event_id or "",
            "event_time": (
                event.event_time.strftime("%Y-%m-%d %H:%M:%S")
                if event.event_time
                else ""
            ),
            "location": event.location_name or "",
            "province": event.extras.get("province", ""),
            "country": event.country or "",
            "rainfall_mm": event.rainfall_mm or 0,
            "rain_term": profile.get("rain_term") or "rain",  # 如果为None，使用默认值
            "flood_term": profile.get("flood_term") or "flood",  # 如果为None，使用默认值
        }

    def _save_raw_items_before_filter(
        self,
        all_items: List[Dict[str, Any]],
        context: EventContext,
        event_info: Dict[str, Any],
    ):
        """保存预过滤前的原始搜索结果到文件。"""
        try:
            from pathlib import Path
            from datetime import datetime
            import json
            
            # 创建输出目录：search_outputs/YYYYMMDD/
            # 从 event_id 提取日期部分（前8位：YYYYMMDD）
            event_id = context.rain_event.event_id
            event_id_str = str(event_id)
            date_dir = event_id_str[:8] if len(event_id_str) >= 8 and event_id_str[:8].isdigit() else ""
            if not date_dir:
                # 如果无法从 ID 提取，尝试从 event_time 获取
                if context.rain_event.event_time:
                    date_dir = context.rain_event.event_time.strftime("%Y%m%d")
                else:
                    date_dir = "unknown"
            
            output_dir = Path("search_outputs") / date_dir
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成文件名（使用完整事件ID，清理特殊字符）
            safe_event_id = event_id.replace("/", "_").replace("\\", "_")
            filename = f"{safe_event_id}_raw_items_before_filter.md"
            filepath = output_dir / filename
            
            # 生成Markdown内容
            content = f"""# 预过滤前的原始搜索结果

生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 事件信息

- **事件ID**: {event_info.get('event_id', 'N/A')}
- **时间**: {event_info.get('event_time', 'N/A')}
- **地点**: {event_info.get('location', 'N/A')} ({event_info.get('province', 'N/A')}, {event_info.get('country', 'N/A')})
- **降雨量**: {event_info.get('rainfall_mm', 'N/A')}mm

## 原始搜索结果统计

- **总数量**: {len(all_items)} 条
- **来源渠道**: {', '.join(context.raw_contents.keys()) if context.raw_contents else 'N/A'}

---

## 原始搜索结果详情

"""
            
            # 添加每条结果
            for idx, item in enumerate(all_items, 1):
                title = item.get("title", "N/A")
                url = item.get("url", "N/A")
                summary = item.get("summary") or item.get("description", "N/A")
                published_at = item.get("published_at", "N/A")
                source = item.get("source", "N/A")
                channel = item.get("channel", "N/A")
                
                # 处理摘要长度
                if isinstance(summary, str) and len(summary) > 300:
                    summary_display = summary[:300] + "..."
                else:
                    summary_display = summary
                
                content += f"""### 结果 {idx}

**标题**: {title}

**URL**: {url}

**摘要**: {summary_display}

**发布时间**: {published_at}

**来源**: {source}

**渠道**: {channel}

**完整数据**:
```json
{json.dumps(item, indent=2, ensure_ascii=False)}
```

---

"""
            
            # 保存文件
            filepath.write_text(content, encoding="utf-8")
            logger.info("✅ 预过滤前的原始搜索结果已保存到: %s", filepath)
            
        except Exception as e:
            logger.warning("保存原始搜索结果失败: %s", e)

    def _save_filtered_items_after_prefilter(
        self,
        filtered_items: List[Dict[str, Any]],
        context: EventContext,
        event_info: Dict[str, Any],
    ):
        """保存预过滤后的结果到文件（通过日期、地点、关键词初筛后的内容）。"""
        try:
            from pathlib import Path
            from datetime import datetime
            import json
            
            # 创建输出目录：search_outputs/YYYYMMDD/
            # 从 event_id 提取日期部分（前8位：YYYYMMDD）
            event_id = context.rain_event.event_id
            event_id_str = str(event_id)
            date_dir = event_id_str[:8] if len(event_id_str) >= 8 and event_id_str[:8].isdigit() else ""
            if not date_dir:
                # 如果无法从 ID 提取，尝试从 event_time 获取
                if context.rain_event.event_time:
                    date_dir = context.rain_event.event_time.strftime("%Y%m%d")
                else:
                    date_dir = "unknown"
            
            output_dir = Path("search_outputs") / date_dir
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成文件名（使用完整事件ID，清理特殊字符）
            safe_event_id = event_id.replace("/", "_").replace("\\", "_")
            filename = f"{safe_event_id}_filtered_items_after_prefilter.md"
            filepath = output_dir / filename
            
            # 生成Markdown内容
            content = f"""# 预过滤后的搜索结果（初筛后）

生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 事件信息

- **事件ID**: {event_info.get('event_id', 'N/A')}
- **时间**: {event_info.get('event_time', 'N/A')}
- **地点**: {event_info.get('location', 'N/A')} ({event_info.get('province', 'N/A')}, {event_info.get('country', 'N/A')})
- **降雨量**: {event_info.get('rainfall_mm', 'N/A')}mm

## 预过滤配置

- **预过滤模式**: {self.config.PRE_FILTER_MODE}
- **时间窗口**: 事件时间 + {self.config.PRE_FILTER_TIME_WINDOW_DAYS} 天
- **过滤规则**: 
  - ✓ 时间匹配（只保留事件时间 + {self.config.PRE_FILTER_TIME_WINDOW_DAYS} 天内的结果）
  - ✓ 地点匹配（标题或摘要包含省名或国家名）
  - ✓ 关键词匹配（标题或摘要包含"rain"/"flood"等关键词）

## 预过滤后结果统计

- **数量**: {len(filtered_items)} 条
- **将交给LLM验证**: 最多 {self.config.MAX_ITEMS_FOR_LLM_VALIDATION} 条

---

## 预过滤后的搜索结果详情

"""
            
            # 添加每条结果
            for idx, item in enumerate(filtered_items, 1):
                title = item.get("title", "N/A")
                url = item.get("url", "N/A")
                summary = item.get("summary") or item.get("description", "N/A")
                published_at = item.get("published_at", "N/A")
                source = item.get("source", "N/A")
                channel = item.get("channel", "N/A")
                
                # 处理摘要长度
                if isinstance(summary, str) and len(summary) > 300:
                    summary_display = summary[:300] + "..."
                else:
                    summary_display = summary
                
                # 标记是否会被交给LLM
                will_send_to_llm = idx <= self.config.MAX_ITEMS_FOR_LLM_VALIDATION
                llm_marker = "✅ 将交给LLM验证" if will_send_to_llm else f"⚠️ 超出限制（只取前{self.config.MAX_ITEMS_FOR_LLM_VALIDATION}条）"
                
                content += f"""### 结果 {idx} {llm_marker}

**标题**: {title}

**URL**: {url}

**摘要**: {summary_display}

**发布时间**: {published_at}

**来源**: {source}

**渠道**: {channel}

**完整数据**:
```json
{json.dumps(item, indent=2, ensure_ascii=False)}
```

---

"""
            
            # 保存文件
            filepath.write_text(content, encoding="utf-8")
            logger.info("✅ 预过滤后的搜索结果已保存到: %s", filepath)
            
        except Exception as e:
            logger.warning("保存预过滤后的搜索结果失败: %s", e)

    def _generate_minimal_report_no_relevant(
        self,
        context: EventContext,
        event_info: Dict[str, Any],
    ) -> str:
        """生成最小报告（验证后没有相关结果时）。"""
        event = context.rain_event
        profile = context.location_profile or {}
        rain_term = profile.get("rain_term", "rain")
        flood_term = profile.get("flood_term", "flood")
        
        report = f"""# Flood Event Report: {event.location_name}, {event.country}

## 1. Event Overview

On {event.event_time.strftime('%B %d, %Y') if event.event_time else 'N/A'}, {event.location_name}, located in {event.extras.get('province', '')}, {event.country}, experienced a rainfall event with {event.rainfall_mm}mm of precipitation.

*   **Local Terminology:**
    *   Rain: "{rain_term}"
    *   Flood: "{flood_term}"

## 2. Flood Timeline

No timeline information is available. After pre-filtering and LLM validation, no relevant news or media sources were found for this event.

## 3. Multimedia & News Sources

No multimedia content or news sources were found for this event. This may be due to:
- The search results did not match the event criteria (time, location, keywords)
- Limited media coverage of the event
- The event may not have generated significant news coverage

## 4. Impact Assessment

No impact assessment data is available as no relevant sources were found for this event.

## 5. Summary

This rainfall event in {event.location_name}, {event.country}, recorded {event.rainfall_mm}mm of precipitation. However, after automated filtering and validation, no relevant news coverage, media sources, or detailed information were found to provide a comprehensive analysis of the event's impact, timeline, or consequences. This may indicate that the event did not generate significant media attention or that the available search results did not match the event criteria.
"""
        return report

    def _save_validation_results(
        self,
        relevant_items: List[Dict[str, Any]],
        irrelevant_items: List[Dict[str, Any]],
        context: EventContext,
        event_info: Dict[str, Any],
    ):
        """保存 Gemini 验证结果到文件（包括被排除项的原因）。"""
        try:
            from pathlib import Path
            from datetime import datetime
            import json
            
            # 创建输出目录：search_outputs/YYYYMMDD/
            # 从 event_id 提取日期部分（前8位：YYYYMMDD）
            event_id = context.rain_event.event_id
            event_id_str = str(event_id)
            date_dir = event_id_str[:8] if len(event_id_str) >= 8 and event_id_str[:8].isdigit() else ""
            if not date_dir:
                # 如果无法从 ID 提取，尝试从 event_time 获取
                if context.rain_event.event_time:
                    date_dir = context.rain_event.event_time.strftime("%Y%m%d")
                else:
                    date_dir = "unknown"
            
            output_dir = Path("search_outputs") / date_dir
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成文件名（使用完整事件ID，清理特殊字符）
            safe_event_id = event_id.replace("/", "_").replace("\\", "_")
            filename = f"{safe_event_id}_llm_validation_results.md"
            filepath = output_dir / filename
            
            # 生成Markdown内容
            content = f"""# LLM 验证结果（Gemini 判断）

生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 事件信息

- **事件ID**: {event_info.get('event_id', 'N/A')}
- **时间**: {event_info.get('event_time', 'N/A')}
- **地点**: {event_info.get('location', 'N/A')} ({event_info.get('province', 'N/A')}, {event_info.get('country', 'N/A')})
- **降雨量**: {event_info.get('rainfall_mm', 'N/A')}mm

## 验证统计

- **相关结果**: {len(relevant_items)} 条
- **不相关结果**: {len(irrelevant_items)} 条

---

## ✅ 相关结果（{len(relevant_items)} 条）

"""
            
            if not relevant_items:
                content += "无相关结果。\n\n"
            else:
                for idx, item in enumerate(relevant_items, 1):
                    title = item.get("title", "N/A")
                    url = item.get("url", "N/A")
                    relevance_score = item.get("relevance_score", "N/A")
                    reason = item.get("reason", "N/A")
                    
                    content += f"""### 相关项 {idx}

**标题**: {title}

**URL**: {url}

**相关性评分**: {relevance_score}

**判断原因**: {reason}

---

"""
            
            content += f"""
## ❌ 不相关结果（{len(irrelevant_items)} 条）- Gemini 排除的原因

"""
            
            if not irrelevant_items:
                content += "无不相关结果。\n\n"
            else:
                content += "以下是 Gemini 判断为不相关的结果及其排除原因：\n\n"
                
                for idx, item in enumerate(irrelevant_items, 1):
                    original_index = item.get("index", "N/A")
                    title = item.get("title", "N/A")
                    url = item.get("url", "N/A")
                    reason = item.get("reason", "N/A")
                    
                    content += f"""### 不相关项 {idx} (原始索引: {original_index})

**标题**: {title}

**URL**: {url}

**❌ 排除原因**: {reason}

---

"""
            
            content += f"""
## 📝 说明

此报告展示了 Gemini LLM 验证步骤的详细结果：

1. **验证目的**: 智能判断搜索结果是否属于该特定事件
2. **判断标准**:
   - 时间是否匹配（事件时间 ± 3天）
   - 地点是否匹配（省级或市级）
   - 内容是否相关（降雨、洪水、灾害）
3. **不相关项**: 如果 Gemini 判断某条结果不相关，会提供详细的排除原因

## 🔗 相关文件

- 预过滤前原始结果: `{safe_event_id}_raw_items_before_filter.md`
- 预过滤后结果: `{safe_event_id}_filtered_items_after_prefilter.md`
- 详细日志: `test_log.md`
"""
            
            # 保存文件
            filepath.write_text(content, encoding="utf-8")
            logger.info("✅ LLM 验证结果已保存到: %s", filepath)
            logger.info("   相关: %s 条, 不相关: %s 条", len(relevant_items), len(irrelevant_items))
            
        except Exception as e:
            logger.warning("保存LLM验证结果失败: %s", e)

    def _step1_validation(
        self, context: EventContext, event_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """步骤 1: 事件验证和冲突解决。"""
        # 收集所有原始搜索结果，并添加channel信息
        all_items: List[Dict[str, Any]] = []
        for channel, items in (context.raw_contents or {}).items():
            for item in items or []:
                # 确保每个item都有channel信息，方便后续识别多媒体
                item_with_channel = {**item, "channel": channel}
                all_items.append(item_with_channel)

        if not all_items:
            logger.warning("没有搜索结果需要验证")
            return {
                "relevant_items": [],
                "irrelevant_items": [],
            }

        # 保存原始搜索结果到文件（预过滤前）
        self._save_raw_items_before_filter(all_items, context, event_info)

        # 预过滤：在交给LLM前进行简单规则判断，媒体优先进入15条
        if self.config.PRE_FILTER_ENABLED:
            original_count = len(all_items)
            all_items, filter_details = self._pre_filter_with_media_priority(all_items, event_info)
            filtered_count = len(all_items)
            if original_count > filtered_count:
                logger.info(
                    "预过滤：从 %s 条结果中过滤出 %s 条相关结果（移除了 %s 条不相关结果，媒体优先）",
                    original_count,
                    filtered_count,
                    original_count - filtered_count,
                )
                # 记录详细日志
                from ..utils.detailed_logger import get_detailed_logger
                detailed_logger = get_detailed_logger()
                detailed_logger.log_pre_filter_results(
                    original_count=original_count,
                    filtered_count=filtered_count,
                    filter_details=filter_details,
                )
                
                # 保存预过滤后的结果到文件
                self._save_filtered_items_after_prefilter(all_items, context, event_info)
        
        # 预过滤后应该已经是15条了（媒体优先），不需要再次限制
        # 但如果超过15条，限制为15条
        if len(all_items) > 15:
            logger.warning(
                "预过滤后结果过多（%s条），限制为15条",
                len(all_items),
            )
            all_items = all_items[:15]

        # 构建 prompt（只使用简短信息：标题+日期+摘要200字符）
        time_window_days = self.config.LLM_VALIDATION_TIME_WINDOW_DAYS
        messages = build_validation_prompt(event_info, all_items, time_window_days)

        # 调用 LLM
        client = self._get_client()
        response = client.chat(
            messages=messages,
            temperature=self.config.LLM_TEMPERATURE,
            max_tokens=self.config.LLM_MAX_TOKENS,
            response_format={"type": "json_object"} if self.config.LLM_PROVIDER == "openai" else None,
        )

        # 解析响应
        result = client.parse_json_response(response)

        # 映射回原始数据，并实现媒体优先
        relevant_items_raw = result.get("relevant_items", [])
        
        # 分离媒体和新闻
        media_items = []
        news_items = []
        for item in relevant_items_raw:
            idx = item.get("index", -1)
            if 0 <= idx < len(all_items):
                original = all_items[idx]
                item_with_score = {
                    **original,
                    "relevance_score": item.get("relevance_score", 0.0),
                    "reason": item.get("reason", ""),
                }
                # 判断是否是媒体
                channel = original.get("channel", "")
                if channel in {"media", "social"}:
                    media_items.append(item_with_score)
                else:
                    news_items.append(item_with_score)
        
        # 媒体优先：即使评分低也优先保留（最多3条）
        # 如果媒体在前10条中，优先保留；如果没有，就跳过
        selected_media = media_items[:3] if len(media_items) >= 3 else media_items
        
        # 新闻补充：取剩余数量（10 - 媒体数量）
        remaining_count = 10 - len(selected_media)
        selected_news = news_items[:remaining_count] if len(news_items) >= remaining_count else news_items
        
        # 合并（媒体优先）
        relevant_items = selected_media + selected_news
        
        irrelevant_items = result.get("irrelevant_items", [])
        logger.info(
            "验证完成: %s 条相关（媒体 %s 条，新闻 %s 条），%s 条不相关",
            len(relevant_items),
            len(selected_media),
            len(selected_news),
            len(irrelevant_items),
        )

        # 保存验证结果到文件（包括被排除项的原因）
        self._save_validation_results(
            relevant_items=relevant_items,
            irrelevant_items=irrelevant_items,
            context=context,
            event_info=event_info,
        )

        return {
            "relevant_items": relevant_items,
            "irrelevant_items": irrelevant_items,
        }

    def _step2_extraction(
        self,
        context: EventContext,
        event_info: Dict[str, Any],
        validation_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """步骤 2: 时间线和影响提取。"""
        verified_items = validation_result.get("relevant_items", [])

        if not verified_items:
            logger.warning("没有验证后的信息需要提取")
            return {"timeline": [], "impact": {}}

        # 构建 prompt
        messages = build_extraction_prompt(event_info, verified_items)
        
        # 记录 LLM 请求
        from ..utils.detailed_logger import get_detailed_logger
        detailed_logger = get_detailed_logger()
        detailed_logger.log_llm_request(
            step="时间线和影响提取",
            step_number=2,
            provider=self.config.LLM_PROVIDER,
            model=self.config.OPENAI_MODEL if self.config.LLM_PROVIDER == "openai" else self.config.GEMINI_MODEL,
            prompt_messages=messages,
            config={
                "temperature": self.config.LLM_TEMPERATURE,
                "max_tokens": self.config.LLM_MAX_TOKENS,
                "response_format": {"type": "json_object"} if self.config.LLM_PROVIDER == "openai" else None,
            },
        )

        # 调用 LLM
        client = self._get_client()
        response = client.chat(
            messages=messages,
            temperature=self.config.LLM_TEMPERATURE,
            max_tokens=self.config.LLM_MAX_TOKENS,
            response_format={"type": "json_object"} if self.config.LLM_PROVIDER == "openai" else None,
        )

        # 解析响应
        result = client.parse_json_response(response)
        
        # 记录 LLM 响应
        detailed_logger.log_llm_response(
            step="时间线和影响提取",
            step_number=2,
            provider=self.config.LLM_PROVIDER,
            raw_response=response,
            parsed_response=result,
        )

        logger.info(
            "提取完成: %s 个时间线节点, %s 个影响类别",
            len(result.get("timeline", [])),
            len(result.get("impact", {})),
        )

        return {
            "timeline": result.get("timeline", []),
            "impact": result.get("impact", {}),
        }

    def _extract_media_from_validation(
        self, validation_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """从步骤1的验证结果中提取多媒体内容（不再单独调用LLM）。"""
        # 从验证后的相关项中筛选出多媒体内容
        relevant_items = validation_result.get("relevant_items", [])
        
        # 识别多媒体内容（通过channel或type字段）
        media_items = []
        for item in relevant_items:
            # 检查是否是多媒体内容
            channel = item.get("channel", "")
            item_type = item.get("type", "")
            # 多媒体渠道包括: media, social, 或者type为media的
            if channel in {"media", "social"} or item_type == "media":
                media_items.append(item)
        
        # 限制多媒体数量（最多10条，按相关性排序）
        if len(media_items) > 10:
            # 按relevance_score排序，取前10条
            media_items.sort(key=lambda x: x.get("relevance_score", 0.0), reverse=True)
            media_items = media_items[:10]
            logger.info("多媒体内容过多，限制为前10条（按相关性排序）")
        
        logger.info("从验证结果中提取了 %s 条多媒体内容", len(media_items))
        
        return {
            "selected_items": media_items,
            "rejected_items": [],  # 不相关的已经在步骤1中被排除了
        }

    def _step4_report_generation(
        self,
        context: EventContext,
        event_info: Dict[str, Any],
        extraction_result: Dict[str, Any],
        validation_result: Dict[str, Any],
        media_result: Dict[str, Any],
    ) -> str:
        """步骤 4: 报告生成。"""
        # 收集所有可用的新闻和多媒体来源
        all_sources = []
        
        # 添加验证后的新闻来源（排除媒体）
        relevant_items = validation_result.get("relevant_items", [])
        for item in relevant_items:
            # 只添加非媒体内容
            channel = item.get("channel", "")
            if channel not in {"media", "social"} and item.get("url"):
                all_sources.append({
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "summary": item.get("summary", ""),
                    "source": item.get("source", ""),
                    "published_at": item.get("published_at", ""),
                    "type": "news",
                })
        
        # 添加筛选后的多媒体来源（从步骤3提取的）
        selected_media = media_result.get("selected_items", [])
        for item in selected_media:
            if item.get("url"):
                all_sources.append({
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "summary": item.get("summary", ""),
                    "source": item.get("source", ""),
                    "published_at": item.get("published_at", ""),
                    "type": "media",
                })
        
        # 构建 prompt
        messages = build_report_prompt(
            event_info=event_info,
            timeline=extraction_result.get("timeline", []),
            impact=extraction_result.get("impact", {}),
            media=all_sources,  # 传递所有可用的来源（新闻+多媒体）
            verified_facts=[],  # 已移除，不再使用
            conflicts=[],  # 已移除，不再使用
        )
        
        # 记录 LLM 请求
        from ..utils.detailed_logger import get_detailed_logger
        detailed_logger = get_detailed_logger()
        detailed_logger.log_llm_request(
            step="报告生成",
            step_number=4,
            provider=self.config.LLM_PROVIDER,
            model=self.config.OPENAI_MODEL if self.config.LLM_PROVIDER == "openai" else self.config.GEMINI_MODEL,
            prompt_messages=messages,
            config={
                "temperature": self.config.LLM_TEMPERATURE,
                "max_tokens": self.config.LLM_MAX_TOKENS,
            },
        )

        # 调用 LLM
        client = self._get_client()
        response = client.chat(
            messages=messages,
            temperature=self.config.LLM_TEMPERATURE,
            max_tokens=self.config.LLM_MAX_TOKENS,
        )

        # 记录 LLM 响应（报告是纯文本，不是JSON）
        detailed_logger.log_llm_response(
            step="报告生成",
            step_number=4,
            provider=self.config.LLM_PROVIDER,
            raw_response=response,
            parsed_response=None,  # 报告不是JSON格式
        )

        return response

