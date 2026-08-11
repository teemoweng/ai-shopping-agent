import os
from pathlib import Path

from app.repositories.commerce_repository import CommerceRepository
from app.repositories.fixture_repository import FixtureRepository
from app.repositories.session_repository import SessionRepository
from app.runtime_paths import resolve_fixture_root, resolve_trace_path
from app.services.catalog_service import CatalogService
from app.services.commerce_service import CommerceService, SystemClock
from app.workflow.engine import WorkflowEngine
from app.workflow.tools import ShoppingTools

API_ROOT = Path(__file__).resolve().parents[1]
fixtures = FixtureRepository.load(resolve_fixture_root(API_ROOT, os.environ))
sessions = SessionRepository(resolve_trace_path(API_ROOT, os.environ))
engine = WorkflowEngine(ShoppingTools(fixtures), sessions)
catalog = CatalogService(fixtures)
commerce_repository = CommerceRepository()
clock = SystemClock()
commerce = CommerceService(fixtures, sessions, commerce_repository, clock)
