from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from . import models  # noqa: F401  (registers tables)
from .config import get_settings
from .database import Base, SessionLocal, engine
from .routers import admin, auth, complaints, requests
from .seed import ensure_admin

settings = get_settings()
ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = ROOT / "frontend"


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        ensure_admin(db)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    """Turn pydantic errors into one readable sentence for the UI."""
    first = exc.errors()[0]
    field = ".".join(str(p) for p in first["loc"] if p not in ("body", "query"))
    message = first["msg"].removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {message}" if field else message})


app.include_router(auth.router)
app.include_router(complaints.router)
app.include_router(admin.router)
app.include_router(requests.router)


@app.get("/api/health", tags=["ops"])
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "app": settings.app_name, "version": app.version}


Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
