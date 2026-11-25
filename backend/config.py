import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"


def _load_dotenv(env_path: Path) -> None:
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


_load_dotenv(BASE_DIR / ".env")


class Config:
    PORT: int = int(os.environ.get("PORT", "5000") or "5000")
    HOST: str = (os.environ.get("HOST") or os.environ.get("FLASK_HOST") or "0.0.0.0").strip() or "0.0.0.0"
    DEFAULT_CITY: str = (os.environ.get("VAYUMITRA_DEFAULT_CITY") or "Mumbai").strip() or "Mumbai"
    SECRET_KEY: str = os.environ.get("SECRET_KEY") or "vayumitra-local-dev-secret"
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024
    HTTP_TIMEOUT_SEC: int = 10
