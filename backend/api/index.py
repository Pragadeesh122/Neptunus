"""Vercel serverless entrypoint for the FastAPI backend.

Vercel's Python runtime serves any module-level ASGI ``app`` it finds in a
file under ``api/``. We re-export the FastAPI app from ``main`` so every
route (/rules, /summarize, /draft, /submit) is handled by this one function.
"""

import os
import sys

# Put the backend root (the parent of this ``api`` directory) on sys.path so
# ``from main import app`` — and main's own ``from config import ...`` etc. —
# resolve regardless of Vercel's working directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402  (import must follow the sys.path tweak)

__all__ = ["app"]
