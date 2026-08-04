from fastapi import FastAPI, status

from app.api.routes.health import router as health_router
from app.domain.contracts import CreateGuideSessionRequest

app = FastAPI(title="AI Shopping Guide", version="0.1.0")
app.include_router(health_router, prefix="/api/v1")


@app.post("/api/v1/guide/sessions", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_guide_session_contract(_: CreateGuideSessionRequest) -> dict[str, str]:
    return {"detail": "route contract declared; service is not wired"}
