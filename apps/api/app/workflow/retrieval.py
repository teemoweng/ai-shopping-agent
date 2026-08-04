import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.models import EvidenceDocument

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
ALIASES = {"waterproof": {"water", "resistant"}, "swim": {"water", "resistant"}}


@dataclass(frozen=True)
class EvidenceHit:
    document: EvidenceDocument
    score: int
    matched_terms: frozenset[str]


def _tokens(text: str) -> set[str]:
    tokens = set(TOKEN_PATTERN.findall(text.lower()))
    expanded = set(tokens)
    for token in tokens:
        expanded.update(ALIASES.get(token, set()))
    return expanded


def retrieve_evidence(
    query: str,
    documents: Iterable[EvidenceDocument],
    limit: int = 3,
) -> tuple[EvidenceHit, ...]:
    query_tokens = _tokens(query)
    hits = []
    for document in documents:
        document_tokens = _tokens(
            " ".join((document.title, document.summary, *document.topics))
        )
        matched = query_tokens & document_tokens
        if matched:
            hits.append(EvidenceHit(document, len(matched), frozenset(matched)))
    hits.sort(key=lambda hit: (-hit.score, hit.document.id))
    return tuple(hits[:limit])
