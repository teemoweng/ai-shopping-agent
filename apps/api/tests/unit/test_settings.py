import pytest

from app.settings import DEFAULT_ALLOWED_ORIGINS, parse_allowed_origins


def test_allowed_origins_default_to_the_two_local_web_origins() -> None:
    assert parse_allowed_origins(None) == DEFAULT_ALLOWED_ORIGINS
    assert parse_allowed_origins("") == DEFAULT_ALLOWED_ORIGINS


def test_allowed_origins_accept_https_trim_and_deduplicate() -> None:
    assert parse_allowed_origins(
        " https://shopping.example ,https://preview.example,https://shopping.example "
    ) == ("https://shopping.example", "https://preview.example")


@pytest.mark.parametrize(
    "value",
    [
        "*",
        "https://user:password@shopping.example",
        "https://shopping.example/path",
        "https://shopping.example?preview=1",
        "https://shopping.example#demo",
        "shopping.example",
    ],
)
def test_allowed_origins_reject_unsafe_or_non_origin_values(value: str) -> None:
    with pytest.raises(ValueError, match="ALLOWED_ORIGINS"):
        parse_allowed_origins(value)
