from pathlib import Path

from app.runtime_paths import resolve_fixture_root, resolve_trace_path


def test_local_runtime_uses_repository_fixtures_and_tracked_trace(tmp_path: Path) -> None:
    api_root = tmp_path / "repo" / "apps" / "api"

    assert resolve_fixture_root(api_root, {}) == tmp_path / "repo" / "data" / "fixtures"
    assert resolve_trace_path(api_root, {}) == api_root / "runtime" / "traces.jsonl"


def test_vercel_runtime_uses_bundled_fixtures_and_tmp_trace(tmp_path: Path) -> None:
    api_root = tmp_path / "var" / "task"

    assert resolve_fixture_root(api_root, {"VERCEL": "1"}) == api_root / "data" / "fixtures"
    assert resolve_trace_path(api_root, {"VERCEL": "1", "TMPDIR": "/tmp"}) == Path(
        "/tmp/ai-shopping-agent/traces.jsonl"
    )
