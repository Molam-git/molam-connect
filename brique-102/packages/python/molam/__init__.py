"""
Molam Python SDK
Official server-side SDK for Molam payments platform
"""

from molam.client import MolamClient
from molam.exceptions import MolamError

__version__ = "2.0.0"
__all__ = ["MolamClient", "MolamError"]
