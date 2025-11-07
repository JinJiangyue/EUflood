"""新闻采集器模块。"""

from .thenewsapi import NewsTheNewsAPICollector

# 注意：gnews 和 serpapi 已禁用，但代码保留作为备选
# from .gnews import NewsGNewsCollector
# from .serpapi import NewsSerpAPICollector

__all__ = [
    "NewsTheNewsAPICollector",
    # "NewsGNewsCollector",
    # "NewsSerpAPICollector",
]
