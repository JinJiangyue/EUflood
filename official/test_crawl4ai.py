import asyncio, json
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, BrowserConfig
from crawl4ai.async_logger import AsyncLogger

async def main():
    run_cfg = CrawlerRunConfig(
        wait_until="networkidle",                 # 等到网络空闲
        delay_before_return_html=3.0,             # 额外等待 3 秒
        wait_for="main, article, #content, [role=main]",
        wait_for_timeout=10000,                   # 最长等待 10 秒
        page_timeout=120000,                      # 导航超时时间延长至 120 秒
        locale="en-US",
        timezone_id="UTC",
        verbose=False,
        js_code=[
            "window.scrollTo(0, document.body.scrollHeight/3);",
            "await new Promise(r=>setTimeout(r,600));",
            "window.scrollTo(0, document.body.scrollHeight);",
            "await new Promise(r=>setTimeout(r,600));",
        ],
    )
    browser_cfg = BrowserConfig(headless=True)
    logger = AsyncLogger(verbose=False)
    async with AsyncWebCrawler(config=browser_cfg, logger=logger) as crawler:
        result = await crawler.arun(
            url="https://storymaps.arcgis.com/stories/6c70797b1eab49ceb421a8990f248bd8/",
            config=run_cfg,
        )
        if len(result) == 0:
            print("未获得任何抓取结果")
            return

        crawl_result = result[0]

        if not crawl_result.success:
            print("抓取失败:", crawl_result.error_message or "未知错误")
            return

        data = crawl_result.model_dump()
        with open("official/output/storymap_story_crawl4ai.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        metadata = data.get("metadata") or {}
        title = metadata.get("meta_title") or metadata.get("title") or data.get("url")
        print("title:", title)

asyncio.run(main())