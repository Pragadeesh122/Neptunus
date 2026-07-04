import os
from pathlib import Path

from dotenv import load_dotenv

# Single env file shared with the frontend, at the repo root.
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

REGULATIONS_GOV_API_KEY = os.getenv("REGULATIONS_GOV_API_KEY", "")
# Switch to https://api-staging.regulations.gov/v4 for commenting tests.
REGULATIONS_GOV_API_BASE = os.getenv(
    "REGULATIONS_GOV_API_BASE", "https://api.regulations.gov/v4"
)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "anthropic/claude-opus-4.8")

DATABASE_URL = os.getenv("DATABASE_URL", "")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "72"))
