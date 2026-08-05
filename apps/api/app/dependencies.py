from pathlib import Path

from app.repositories.commerce_repository import CommerceRepository
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.services.catalog_service import CatalogService
from app.services.commerce_service import CommerceService, SystemClock
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
fixtures = FixtureRepository.load(REPOSITORY_ROOT / "data" / "fixtures")
sessions = SessionRepository(
    REPOSITORY_ROOT / "apps" / "api" / "runtime" / "traces.jsonl"
)
engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
catalog = CatalogService(fixtures)
commerce_repository = CommerceRepository()
clock = SystemClock()
commerce = CommerceService(fixtures, sessions, commerce_repository, clock)
