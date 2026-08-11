from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.cart import router as cart_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.commerce import router as commerce_router
from app.api.routes.guide import router as guide_router
from app.api.routes.health import router as health_router
from app.settings import parse_allowed_origins


def create_app(allowed_origins: tuple[str, ...] | None = None) -> FastAPI:
    application = FastAPI(title="AI Shopping Guide", version="0.1.0")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(allowed_origins or parse_allowed_origins()),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    application.include_router(health_router, prefix="/api/v1")
    application.include_router(guide_router, prefix="/api/v1")
    application.include_router(cart_router, prefix="/api/v1")
    application.include_router(catalog_router, prefix="/api/v1")
    application.include_router(commerce_router, prefix="/api/v1")
    return application


app = create_app()
