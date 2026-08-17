from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Base
    APP_NAME: str = "Tributo POS"
    DEBUG: bool = False

    # Database — Railway provee DATABASE_URL automáticamente
    DATABASE_URL: str = "postgresql://user:pass@localhost/tributo"

    # JWT
    SECRET_KEY: str = "cambiar-en-produccion-clave-secreta-larga"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"

settings = Settings()
