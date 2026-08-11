from collections.abc import Mapping
from pathlib import Path


def resolve_fixture_root(api_root: Path, environment: Mapping[str, str]) -> Path:
    if environment.get("VERCEL") == "1":
        return api_root / "data" / "fixtures"
    return api_root.parents[1] / "data" / "fixtures"


def resolve_trace_path(api_root: Path, environment: Mapping[str, str]) -> Path:
    if environment.get("VERCEL") == "1":
        temporary_root = Path(environment.get("TMPDIR", "/tmp"))
        return temporary_root / "ai-shopping-agent" / "traces.jsonl"
    return api_root / "runtime" / "traces.jsonl"
