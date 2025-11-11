#!/usr/bin/env python3
"""Web → JSON 抽取脚本（优先 Crawl4AI，失败回退到 requests+BeautifulSoup）

用法：
  apps\api\python-embed\python.exe official\web_to_json.py \
    --url https://example.com/page \
    --output official/output/page.json

说明：
- 尝试使用 crawl4ai 抓取正文、标题、链接、图片；
- 若不可用或失败，则使用 requests + BeautifulSoup + readability 进行回退解析；
- 输出字段包含：url、title、text、sections、links、images、meta。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

# 回退依赖
import requests
from bs4 import BeautifulSoup


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch web page and export as JSON")
    p.add_argument("--url", required=True, help="目标页面 URL")
    p.add_argument("--output", default="official/output/page.json", help="输出 JSON 路径")
    return p.parse_args()


def try_crawl4ai(url: str) -> Optional[Dict[str, Any]]:
    """优先走 crawl4ai；不可用/失败返回 None。"""
    try:
        # 延迟导入，避免无库时报错
        from crawl4ai import AsyncWebCrawler
        import asyncio

        async def run() -> Dict[str, Any]:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(url)
                # 兼容不同版本字段命名
                title = getattr(result, "title", None) or getattr(result, "page_title", None)
                text = getattr(result, "text", None) or getattr(result, "cleaned_text", None)
                links = getattr(result, "links", None) or []
                images = getattr(result, "images", None) or []
                meta = getattr(result, "metadata", None) or {}
                sections = []
                # 部分版本提供 sections/headers
                headers = getattr(result, "headers", None) or []
                if headers:
                    for h in headers:
                        sections.append({"tag": h.get("tag"), "text": h.get("text")})
                return {
                    "url": url,
                    "title": title,
                    "text": text,
                    "sections": sections,
                    "links": links,
                    "images": images,
                    "meta": meta,
                }

        return asyncio.run(run())
    except Exception:
        return None


def fallback_bs4(url: str) -> Dict[str, Any]:
    headers = {
        "User-Agent": "EUflood-Crawler/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    html = resp.text
    soup = BeautifulSoup(html, "lxml")

    # 标题
    title = (soup.title.string.strip() if soup.title and soup.title.string else None)

    # 提取主文本（简化版）
    # 优先选择含有较多 <p> 的容器
    best_node = None
    best_score = -1
    for node in soup.find_all(["article", "main", "section", "div"]):
        p_count = len(node.find_all("p"))
        text_len = len(node.get_text(strip=True))
        score = p_count * 5 + text_len
        if score > best_score:
            best_score = score
            best_node = node
    main_text = (best_node.get_text("\n", strip=True) if best_node else soup.get_text("\n", strip=True))

    # 章节标题
    sections: List[Dict[str, Any]] = []
    for tag in ["h1", "h2", "h3"]:
        for h in soup.find_all(tag):
            t = h.get_text(strip=True)
            if t:
                sections.append({"tag": tag, "text": t})

    # 链接与图片
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        txt = a.get_text(strip=True)
        if href and href.lower().startswith("http"):
            links.append({"href": href, "text": txt})
    images = []
    for img in soup.find_all("img", src=True):
        src = img["src"].strip()
        alt = img.get("alt", "").strip()
        if src:
            images.append({"src": src, "alt": alt})

    # meta
    meta = {}
    for m in soup.find_all("meta"):
        name = m.get("name") or m.get("property")
        content = m.get("content")
        if name and content:
            meta[name] = content

    return {
        "url": url,
        "title": title,
        "text": main_text,
        "sections": sections,
        "links": links,
        "images": images,
        "meta": meta,
    }


def main() -> None:
    args = parse_args()
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    data = try_crawl4ai(args.url)
    if data is None:
        data = fallback_bs4(args.url)

    payload = {
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "data": data,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已生成 → {out_path}")


if __name__ == "__main__":
    main()





