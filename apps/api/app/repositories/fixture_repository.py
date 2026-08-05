from dataclasses import dataclass, field
from pathlib import Path

from app.domain.fixtures import load_model_list
from app.domain.models import (
    ContentContext,
    EvidenceDocument,
    FeedItem,
    Product,
    Sku,
)


@dataclass(frozen=True)
class FixtureRepository:
    products: dict[str, Product]
    content_contexts: dict[str, ContentContext]
    evidence_documents: dict[str, EvidenceDocument]
    feed_items: dict[str, FeedItem] = field(default_factory=dict)

    @classmethod
    def load(cls, root: Path) -> "FixtureRepository":
        products = load_model_list(root / "products.json", Product)
        contexts = load_model_list(root / "content-contexts.json", ContentContext)
        evidence = load_model_list(root / "evidence.json", EvidenceDocument)
        feed_items = load_model_list(root / "feed-items.json", FeedItem)
        for records, label in (
            (products, "product"),
            (contexts, "content context"),
            (evidence, "evidence"),
            (feed_items, "feed item"),
        ):
            if len(records) != len({record.id for record in records}):
                raise ValueError(f"duplicate {label} id")
        repository = cls(
            products={item.id: item for item in products},
            content_contexts={item.id: item for item in contexts},
            evidence_documents={item.id: item for item in evidence},
            feed_items={item.id: item for item in feed_items},
        )
        repository._validate_references()
        return repository

    def _validate_references(self) -> None:
        sku_ids = [sku.id for product in self.products.values() for sku in product.skus]
        if len(sku_ids) != len(set(sku_ids)):
            raise ValueError("sku ids must be unique")
        for context in self.content_contexts.values():
            if context.anchor_product_id not in self.products:
                raise ValueError(f"unknown anchor product: {context.anchor_product_id}")
            for claim in context.claims:
                if claim.evidence_id not in self.evidence_documents:
                    raise ValueError(f"unknown evidence: {claim.evidence_id}")
        for feed_item in self.feed_items.values():
            if (
                feed_item.content_context_id is not None
                and feed_item.content_context_id not in self.content_contexts
            ):
                raise ValueError(
                    f"unknown feed content context: {feed_item.content_context_id}"
                )
            if (
                feed_item.anchor_product_id is not None
                and feed_item.anchor_product_id not in self.products
            ):
                raise ValueError(
                    f"unknown feed anchor product: {feed_item.anchor_product_id}"
                )

    def get_product(self, product_id: str) -> Product:
        return self.products[product_id]

    def get_sku(self, sku_id: str) -> Sku:
        return next(
            sku
            for product in self.products.values()
            for sku in product.skus
            if sku.id == sku_id
        )

    def get_content_context(self, context_id: str) -> ContentContext:
        return self.content_contexts[context_id]

    def list_evidence(self) -> tuple[EvidenceDocument, ...]:
        return tuple(self.evidence_documents.values())
