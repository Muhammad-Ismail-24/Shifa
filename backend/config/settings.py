# Loads all env vars via pydantic BaseSettings
"""Configuration settings for the Shifa backend loaded via Pydantic."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    gemini_api_key: str
    google_places_api_key: str
    qdrant_url: str
    qdrant_api_key: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
