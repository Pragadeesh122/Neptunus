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
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-chat")

DATABASE_URL = os.getenv("DATABASE_URL", "")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "72"))

# --- Ingestion pipeline: Pinecone vector DB + embeddings ---
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "neptunus-rules")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-large")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "3072"))
