from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Docspyre AI Backend"
    API_V1_STR: str = "/api/v1"
    
    # Database config (can be overridden by DATABASE_URL environment variable)
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/docspyre"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
