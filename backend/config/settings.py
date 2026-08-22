"""
Application settings loaded from environment variables via pydantic-settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Loads all required env vars; reads from .env file automatically."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    GEMINI_API_KEY: str = ""
    GOOGLE_PLACES_API_KEY: str = ""
    QDRANT_URL: str = ""
    QDRANT_API_KEY: str = ""


# Singleton — import this instance everywhere
settings = Settings()
