"""
Centralised logging — never use print() in the codebase.
Import `logger` from this module everywhere.
"""

import logging
import sys


def _build_logger(name: str = "shifa") -> logging.Logger:
    """Create and configure the application-wide logger."""
    _logger = logging.getLogger(name)
    _logger.setLevel(logging.DEBUG)

    # Prevent duplicate handlers if module is re-imported
    if not _logger.handlers:
        console = logging.StreamHandler(sys.stdout)
        console.setLevel(logging.DEBUG)
        fmt = logging.Formatter(
            "[%(asctime)s] %(levelname)-8s %(name)s — %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        console.setFormatter(fmt)
        _logger.addHandler(console)

    return _logger


logger = _build_logger()
