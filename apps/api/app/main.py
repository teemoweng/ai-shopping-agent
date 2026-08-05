from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.cart import router as cart_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.commerce import router as commerce_router
from app.api.routes.guide import router as guide_router
from app.api.routes.health import router as health_router

app = FastAPI(title="AI Shopping Guide", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(health_router, prefix="/api/v1")
app.include_router(guide_router, prefix="/api/v1")
app.include_router(cart_router, prefix="/api/v1")
app.include_router(catalog_router, prefix="/api/v1")
app.include_router(commerce_router, prefix="/api/v1")
