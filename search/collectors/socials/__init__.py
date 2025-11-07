"""社交媒体采集器模块。"""

from .instagram import SocialInstagramCollector
from .x_twitter import SocialXTwitterCollector

__all__ = [
    "SocialInstagramCollector",
    "SocialXTwitterCollector",
]

