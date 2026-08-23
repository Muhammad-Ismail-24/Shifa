# Centralised logging — never use print()
"""Centralized logging utility for the Shifa backend."""

import logging
import sys


def setup_logger() -> logging.Logger:
    """Configure and return the centralized logger for the Shifa application."""
    shifa_logger = logging.getLogger("shifa")
    shifa_logger.setLevel(logging.DEBUG)

    if not shifa_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter(
            fmt="[%(asctime)s] %(levelname)s | %(name)s | %(message)s",
            datefmt="%H:%M:%S",
        )
        handler.setFormatter(formatter)
        shifa_logger.addHandler(handler)

    return shifa_logger


logger = setup_logger()
