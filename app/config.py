from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    database_url: str = "sqlite:///./chatbot.db"
    max_tokens: int = 2048
    default_system_prompt: str = (
        "You are a helpful, concise AI assistant. "
        "Answer clearly and use markdown when it improves readability."
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
