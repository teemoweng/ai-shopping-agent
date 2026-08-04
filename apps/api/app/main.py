from fastapi import FastAPI

from app.api.routes.guide import router as guide_router
from app.api.routes.health import router as health_router

app = FastAPI(title="AI Shopping Guide", version="0.1.0")
app.include_router(health_router, prefix="/api/v1")
app.include_router(guide_router, prefix="/api/v1")
