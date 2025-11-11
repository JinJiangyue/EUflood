#!/usr/bin/env python3
"""ArcGIS StoryMap trusted-source fetcher.

Usage
-----
python official/storymap_fetch.py \
    --url https://storymaps.arcgis.com/stories/6c70797b1eab49ceb421a8990f248bd8/ \
    --output official/output/storymap_events.json

Notes
-----
- 仅使用匿名 GET 请求，未带认证。
- 输出 JSON 结构与 `rain_event` / `rain_flood_impact` 的字段映射保持一致，便于后续入库。
- 若 StoryMap 包含多个 WebMap / FeatureLayer，会全部解析并合并。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from html import unescape

STORY_ID_PATTERN = re.compile(r"stories/([a-f0-9]{32})", re.IGNORECASE)
ARCGIS_PORTAL_BASE = "https://www.arcgis.com/sharing/rest"
DEFAULT_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "EUflood-TrustedSource/1.0 (+https://github.com/)"
}
QUERY_PARAMS = {
    "f": "json",
    "where": "1=1",
    "returnGeometry": "true",
    "outSR": "4326",
    "outFields": "*",
}


@dataclass
class StandardEvent:
    """标准化后的 trusted 数据结构，方便落库。"""

    external_id: str
    source: str
    source_url: str
    title: str
    description: Optional[str]
    date: Optional[str]
    country: Optional[str]
    province: Optional[str]
    city: Optional[str]
    longitude: Optional[float]
    latitude: Optional[float]
    geometry_type: Optional[str]
    geometry: Optional[Dict[str, Any]]
    raw_properties: Dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch StoryMap data and normalize to JSON.")
    parser.add_argument("--url", required=True, help="StoryMap 页面链接")
    parser.add_argument(
        "--output",
        default="official/output/storymap_events.json",
        help="输出 JSON 文件路径 (默认: official/output/storymap_events.json)",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=2000,
        help="每个图层最大抓取要素数量，默认 2000",
    )
    return parser.parse_args()


def ensure_output_dir(path: Path) -> None:
    if not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def extract_story_id(url: str) -> str:
    match = STORY_ID_PATTERN.search(url)
    if not match:
        raise ValueError(f"无法从 URL 提取 Story ID: {url}")
    return match.group(1)


def fetch_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    resp = requests.get(url, params=params, timeout=30, headers=DEFAULT_HEADERS)
    resp.raise_for_status()
    try:
        return resp.json()
    except requests.JSONDecodeError:
        snippet = resp.text[:200]
        raise ValueError(
            f"期望 JSON 响应，实际返回: {snippet!r} (url={url})"
        )


def fetch_story_config(story_id: str) -> Dict[str, Any]:
    # 1) 首选 JSON 接口（部分站点不可用，会返回 HTML）
    story_json_url = f"https://storymaps.arcgis.com/stories/{story_id}?data&f=json"
    try:
        return fetch_json(story_json_url)
    except Exception:
        pass

    # 2) 退回抓取 HTML，解析 __NEXT_DATA__ 中的 story 数据
    page_url = f"https://storymaps.arcgis.com/stories/{story_id}"
    resp = requests.get(page_url, headers=DEFAULT_HEADERS, timeout=30)
    resp.raise_for_status()
    html = resp.text

    # 找到 __NEXT_DATA__ 脚本块
    # 典型：<script id="__NEXT_DATA__" type="application/json">{...}</script>
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE)
    if m:
        raw = m.group(1)
        raw = unescape(raw)
        try:
            next_data = json.loads(raw)
            # 常见结构：props → pageProps → story
            for key_path in [
                ["props", "pageProps", "story"],
                ["props", "pageProps", "data"],
                ["props", "pageProps"],
            ]:
                node = next_data
                ok = True
                for k in key_path:
                    if isinstance(node, dict) and k in node:
                        node = node[k]
                    else:
                        ok = False
                        break
                if ok and isinstance(node, dict) and node:
                    return node
        except Exception:
            pass

    # 3) 最后退回：构造最小结构，仅依赖正则提取图层 URL
    # 这样至少能落到 iter_feature_layers 的正则回退逻辑
    return {"_html": html}


def iter_feature_layers(story_data: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    # 1) 标准结构
    resources = story_data.get("resources") if isinstance(story_data, dict) else None
    if isinstance(resources, list):
        for res in resources:
            if not isinstance(res, dict) or res.get("type") != "webmap":
                continue
            data = res.get("data") or {}
            webmap_data = data.get("item") or {}
            operational_layers = webmap_data.get("itemData", {}).get("operationalLayers", [])
            for layer in operational_layers:
                url = layer.get("url")
                if not url:
                    continue
                yield {
                    "layer_url": url,
                    "layer_title": layer.get("title"),
                    "popup_info": layer.get("popupInfo"),
                }

    # 2) 退回：从 HTML 文本中直接提取 FeatureServer 图层 URL
    html = story_data.get("_html") if isinstance(story_data, dict) else None
    if isinstance(html, str):
        # 2.1 直接匹配 FeatureServer / MapServer 图层
        for pat in [
            r'https://[^"\']+/FeatureServer/\d+',
            r'https://[^"\']+/MapServer/\d+',
        ]:
            for match in re.finditer(pat, html, re.IGNORECASE):
                url = match.group(0)
                yield {"layer_url": url, "layer_title": "ArcGISLayer", "popup_info": None}

        # 2.2 提取所有 href/src 链接，并尝试跟踪短链，查找目标页中的服务链接
        links: List[str] = []
        for attr in ["href", "src"]:
            attr_pat = rf'{attr}=[\"\'](.*?)[\"\']'
            for m in re.finditer(attr_pat, html, re.IGNORECASE):
                links.append(m.group(1))

        unique_links = []
        seen = set()
        for u in links:
            if not u.startswith("http"):
                continue
            if u in seen:
                continue
            seen.add(u)
            unique_links.append(u)

        for u in unique_links:
            try:
                # 跟踪跳转，拿最终内容
                r = requests.get(u, headers=DEFAULT_HEADERS, timeout=20, allow_redirects=True)
                final_url = r.url
                text = r.text
            except Exception:
                continue

            # 最终内容中再找服务链接
            for pat in [
                r'https://[^"\']+/FeatureServer/\d+',
                r'https://[^"\']+/MapServer/\d+',
                r'https://[^"\']+\.geojson',
                r'https://[^"\']+\.csv',
            ]:
                for match in re.finditer(pat, text, re.IGNORECASE):
                    url = match.group(0)
                    yield {"layer_url": url, "layer_title": "DetectedLayer", "popup_info": None}


def fetch_feature_layer(layer_url: str, max_features: int) -> List[Dict[str, Any]]:
    params = QUERY_PARAMS.copy()
    params["resultRecordCount"] = max_features
    data = fetch_json(f"{layer_url}/query", params=params)
    features = data.get("features", [])
    return features


def normalize_feature(
    feature: Dict[str, Any],
    source_url: str,
    layer_title: Optional[str],
    popup_info: Optional[Dict[str, Any]],
) -> StandardEvent:
    attrs = feature.get("attributes", {})
    geom = feature.get("geometry")

    external_id = str(attrs.get("OBJECTID") or attrs.get("GlobalID") or attrs.get("FID") or "")
    title = attrs.get("title") or attrs.get("Name") or layer_title or "StoryMap Event"
    description = attrs.get("description") or attrs.get("Desc") or None

    date_fields = [
        key for key in attrs.keys() if "date" in key.lower() or "time" in key.lower()
    ]
    extracted_date: Optional[str] = None
    for key in date_fields:
        val = attrs.get(key)
        if isinstance(val, (int, float)) and val > 10_000:
            extracted_date = dt.datetime.utcfromtimestamp(val / 1000).strftime("%Y-%m-%d")
            break
        if isinstance(val, str) and re.search(r"\d{4}-\d{2}-\d{2}", val):
            extracted_date = val[:10]
            break

    country = attrs.get("Country") or attrs.get("ISO") or None
    province = attrs.get("Province") or attrs.get("Region") or attrs.get("State") or None
    city = attrs.get("City") or attrs.get("Location") or None

    lon = attrs.get("Longitude") or attrs.get("Lon")
    lat = attrs.get("Latitude") or attrs.get("Lat")

    if geom and (lon is None or lat is None):
        if "x" in geom and "y" in geom:
            lon, lat = geom["x"], geom["y"]
        elif "rings" in geom:
            # 取 polygon 的第一点
            first_ring = geom["rings"][0]
            if first_ring:
                lon, lat = first_ring[0]

    event = StandardEvent(
        external_id=external_id or f"layer:{layer_title}-feature:{hash(json.dumps(attrs, sort_keys=True))}",
        source="trusted",
        source_url=source_url,
        title=title,
        description=description,
        date=extracted_date,
        country=country,
        province=province,
        city=city,
        longitude=float(lon) if lon is not None else None,
        latitude=float(lat) if lat is not None else None,
        geometry_type=feature.get("geometryType"),
        geometry=geom,
        raw_properties=attrs,
    )
    return event


def collect_events(story_url: str, max_features: int) -> List[StandardEvent]:
    story_id = extract_story_id(story_url)
    story_data = fetch_story_config(story_id)

    events: List[StandardEvent] = []
    for layer_info in iter_feature_layers(story_data):
        layer_url = layer_info["layer_url"]
        layer_title = layer_info.get("layer_title")
        popup_info = layer_info.get("popup_info")

        try:
            features = fetch_feature_layer(layer_url, max_features=max_features)
        except requests.HTTPError as exc:
            print(f"[WARN] 抓取图层失败 {layer_url}: {exc}")
            continue

        for feature in features:
            event = normalize_feature(
                feature,
                source_url=layer_url,
                layer_title=layer_title,
                popup_info=popup_info,
            )
            events.append(event)

    return events


def main() -> None:
    args = parse_args()
    story_url = args.url.rstrip("/") + "/"
    events = collect_events(story_url, max_features=args.max_features)

    output_path = Path(args.output)
    ensure_output_dir(output_path)

    payload = {
        "story_url": story_url,
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "total_events": len(events),
        "events": [asdict(event) for event in events],
    }

    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已生成 {len(events)} 条记录 → {output_path}")


if __name__ == "__main__":
    main()
