#!/usr/bin/env python3
"""深度搜索流程脚本。

使用方法：
    # 使用嵌入式Python（推荐）
    apps/api/python-embed/python.exe apps/api/scripts/deep_search.py
    
    # 或使用系统Python
    python apps/api/scripts/deep_search.py

    # 处理所有待处理的事件
    python apps/api/scripts/deep_search.py

    # 处理指定的事件ID
    python apps/api/scripts/deep_search.py --event-id "20251011_Valencia_1"

    # 从JSON创建事件（用于API调用）
    python apps/api/scripts/deep_search.py --json '{"id":"...","date":"...",...}'
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
# 文件现在在 apps/api/scripts/deep_search.py，需要向上3级到项目根目录
project_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(project_root))

# 如果使用嵌入式Python，确保可以找到项目根目录
if not os.environ.get("PYTHONPATH"):
    os.environ["PYTHONPATH"] = str(project_root)

from search.config.settings import settings
from search.orchestrator.workflow import SearchWorkflow
from search.utils.detailed_logger import get_detailed_logger, reset_detailed_logger
from search.watcher.rain_event_watcher import RainEvent, RainEventWatcher

# 配置日志
def get_log_level(level_str: str) -> int:
    """将字符串日志级别转换为 logging 常量。"""
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR,
        "critical": logging.CRITICAL,
    }
    return level_map.get(level_str.upper(), logging.INFO)

logging.basicConfig(
    level=get_log_level(settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


def create_event_from_dict(data: dict) -> RainEvent:
    """从字典创建 RainEvent 对象。"""
    from datetime import datetime
    
    event_time = None
    if data.get("date"):
        try:
            event_time = datetime.fromisoformat(data["date"])
        except (ValueError, TypeError):
            pass
    
    return RainEvent(
        event_id=data.get("id"),
        event_time=event_time,
        location_name=data.get("city"),
        country=data.get("country"),
        latitude=data.get("latitude"),
        longitude=data.get("longitude"),
        rainfall_mm=data.get("value"),
        data_source=data.get("file_name"),
        extras={
            "province": data.get("province"),
            "threshold": data.get("threshold"),
            "seq": data.get("seq"),
        },
    )


def main():
    parser = argparse.ArgumentParser(description="测试搜索流程")
    parser.add_argument(
        "--event-id",
        type=str,
        help="要处理的事件ID（如果未指定，则处理所有待处理事件）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅测试，不更新数据库",
    )
    parser.add_argument(
        "--json",
        type=str,
        help="从 JSON 字符串创建事件（用于直接测试）",
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default="test_log.md",
        help="详细日志输出文件（默认: test_log.md）",
    )
    
    args = parser.parse_args()
    
    # 初始化详细日志记录器
    detailed_logger = get_detailed_logger(args.log_file)
    detailed_logger.start_section("搜索流程详细日志", "记录从输入到输出的完整流程")
    
    logger.info("=" * 60)
    logger.info("搜索流程测试")
    logger.info("=" * 60)
    logger.info(f"数据库文件: {settings.DB_FILE or settings.DB_NAME}")
    logger.info(f"表名: {settings.RAIN_EVENTS_TABLE}")
    logger.info(f"日志级别: {settings.LOG_LEVEL}")
    logger.info("=" * 60)
    
    workflow = SearchWorkflow()
    
    if args.json:
        # 从 JSON 字符串创建事件
        try:
            # 清理 JSON 字符串（去除可能的换行符和空白）
            json_str = args.json.strip()
            # 如果看起来像文件路径，尝试读取文件
            if json_str.startswith('{') and json_str.endswith('}'):
                data = json.loads(json_str)
            else:
                # 可能是文件路径，尝试读取
                json_path = Path(json_str)
                if json_path.exists():
                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    # 尝试直接解析
                    data = json.loads(json_str)
            
            event = create_event_from_dict(data)
            logger.info(f"从 JSON 创建事件: {event.event_id}")
            logger.info(f"事件详情: {event.as_dict()}")
            
            # 记录输入事件
            detailed_logger.log_input(event.as_dict())
            
            if args.dry_run:
                logger.info("【DRY RUN 模式】不会更新数据库")
            else:
                logger.warning("【注意】直接处理 JSON 事件不会更新数据库中的 searched 标志")
            
            context = workflow.run_for_event(event)
            
            # 保存详细日志
            detailed_logger.save_to_file()
            logger.info("=" * 60)
            logger.info("处理完成！")
            logger.info(f"事件ID: {context.rain_event.event_id}")
            logger.info(f"报告数量: {len(context.reports)}")
            if context.reports:
                logger.info("生成的报告:")
                for report_type, report_content in context.reports.items():
                    logger.info(f"  - {report_type}: {len(report_content)} 字符")
            
            # 保存报告到文件：search_outputs/YYYYMMDD/完整ID_report.md
            # 从 event_id 提取日期部分（前8位：YYYYMMDD）
            event_id_str = str(event.event_id)
            date_dir = event_id_str[:8] if len(event_id_str) >= 8 else ""
            if not date_dir or not date_dir.isdigit():
                # 如果无法从 ID 提取，尝试从 event_time 获取
                if event.event_time:
                    date_dir = event.event_time.strftime("%Y%m%d")
                else:
                    date_dir = "unknown"
            
            output_dir = project_root / "search_outputs" / date_dir
            output_dir.mkdir(parents=True, exist_ok=True)
            # 使用完整的 event_id（包含 seq）
            safe_event_id = str(event.event_id).replace("/", "_").replace("\\", "_")
            output_file = output_dir / f"{safe_event_id}_report.md"
            
            # 保存英文报告
            if context.reports.get("english"):
                output_file.write_text(context.reports["english"], encoding="utf-8")
                logger.info(f"报告已保存到: {output_file}")
            elif context.reports.get("local"):
                # 如果没有英文报告，保存本地报告
                output_file.write_text(context.reports["local"], encoding="utf-8")
                logger.info(f"报告已保存到: {output_file}")
            else:
                logger.warning("没有可保存的报告内容")
            
            # 输出 JSON 结果到 stdout（供 Node.js 读取）
            # 获取 _process_contents 返回的结果（包含 table2_data）
            processed_result = context.processed_summary if hasattr(context, 'processed_summary') else {}
            result_json = {
                "success": True,
                "event_id": str(event.event_id),
                "table2_data": processed_result.get("table2_data"),  # 表2数据（由 Node.js 写入数据库）
                "report_file": str(output_file.relative_to(project_root)) if output_file.exists() else None,
            }
            # 输出到 stdout（Node.js 会读取）
            sys.stdout.buffer.write(json.dumps(result_json, ensure_ascii=False).encode('utf-8'))
            sys.stdout.buffer.write(b"\n")
            sys.stdout.flush()
            
            return 0
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析失败: {e}")
            return 1
        except Exception as e:
            logger.exception(f"处理事件失败: {e}")
            return 1
    
    if args.event_id:
        # 处理指定的事件ID
        watcher = RainEventWatcher()
        events = watcher.fetch_pending_events()
        target_event = None
        
        for event in events:
            if event.event_id == args.event_id:
                target_event = event
                break
        
        if not target_event:
            logger.error(f"未找到事件ID: {args.event_id}")
            logger.info("可用的待处理事件:")
            for event in events:
                logger.info(f"  - {event.event_id} ({event.location_name}, {event.country})")
            return 1
        
        logger.info(f"找到事件: {target_event.event_id}")
        logger.info(f"事件详情: {target_event.as_dict()}")
        
        if args.dry_run:
            logger.info("【DRY RUN 模式】不会更新数据库")
            context = workflow.run_for_event(target_event)
        else:
            context = workflow.run_for_event(target_event)
            workflow.watcher.mark_event_completed(target_event, processed_at=context.finished_at)
            logger.info(f"已更新数据库，标记事件 {target_event.event_id} 为已处理")
        
        logger.info("=" * 60)
        logger.info("处理完成！")
        logger.info(f"事件ID: {context.rain_event.event_id}")
        logger.info(f"报告数量: {len(context.reports)}")
        if context.reports:
            logger.info("生成的报告:")
            for report_type, report_content in context.reports.items():
                logger.info(f"  - {report_type}: {len(report_content)} 字符")
        
        # 保存报告到文件：search_outputs/YYYYMMDD/完整ID_report.md
        # 从 event_id 提取日期部分（前8位：YYYYMMDD）
        event_id_str = str(target_event.event_id)
        date_dir = event_id_str[:8] if len(event_id_str) >= 8 else ""
        if not date_dir or not date_dir.isdigit():
            # 如果无法从 ID 提取，尝试从 event_time 获取
            if target_event.event_time:
                date_dir = target_event.event_time.strftime("%Y%m%d")
            else:
                date_dir = "unknown"
        
        output_dir = project_root / "search_outputs" / date_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        # 使用完整的 event_id（包含 seq）
        safe_event_id = str(target_event.event_id).replace("/", "_").replace("\\", "_")
        output_file = output_dir / f"{safe_event_id}_report.md"
        
        if context.reports.get("english"):
            output_file.write_text(context.reports["english"], encoding="utf-8")
            logger.info(f"报告已保存到: {output_file}")
        elif context.reports.get("local"):
            output_file.write_text(context.reports["local"], encoding="utf-8")
            logger.info(f"报告已保存到: {output_file}")
        else:
            logger.warning("没有可保存的报告内容")
        
        return 0
    
    # 处理所有待处理事件
    logger.info("开始处理所有待处理事件...")
    contexts = workflow.process_pending_events()
    
    logger.info("=" * 60)
    logger.info(f"处理完成！共处理 {len(contexts)} 个事件")
    
    for context in contexts:
        logger.info(f"  - {context.rain_event.event_id}: {len(context.reports)} 个报告")
        # 保存报告：search_outputs/YYYYMMDD/完整ID_report.md
        # 从 event_id 提取日期部分（前8位：YYYYMMDD）
        event_id_str = str(context.rain_event.event_id)
        date_dir = event_id_str[:8] if len(event_id_str) >= 8 else ""
        if not date_dir or not date_dir.isdigit():
            # 如果无法从 ID 提取，尝试从 event_time 获取
            if context.rain_event.event_time:
                date_dir = context.rain_event.event_time.strftime("%Y%m%d")
            else:
                date_dir = "unknown"
        
        output_dir = project_root / "search_outputs" / date_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        # 使用完整的 event_id（包含 seq）
        safe_event_id = str(context.rain_event.event_id).replace("/", "_").replace("\\", "_")
        output_file = output_dir / f"{safe_event_id}_report.md"
        
        if context.reports.get("english"):
            output_file.write_text(context.reports["english"], encoding="utf-8")
            logger.info(f"  报告已保存: {output_file}")
        elif context.reports.get("local"):
            output_file.write_text(context.reports["local"], encoding="utf-8")
            logger.info(f"  报告已保存: {output_file}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

