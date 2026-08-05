from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import catalog
from app.domain.contracts import FeedResponse, ProductDetailResponse
from app.services.catalog_service import CatalogService

router = APIRouter(prefix="/catalog", tags=["catalog"])


def get_catalog_service() -> CatalogService:
    return catalog


CatalogServiceDependency = Annotated[CatalogService, Depends(get_catalog_service)]


@router.get("/feed", response_model=FeedResponse)
def get_feed(catalog_service: CatalogServiceDependency) -> FeedResponse:
    return catalog_service.feed()


@router.get("/products/{product_id}", response_model=ProductDetailResponse)
def get_product(
    product_id: str,
    catalog_service: CatalogServiceDependency,
) -> ProductDetailResponse:
    try:
        return catalog_service.product_detail(product_id)
    except KeyError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PRODUCT_NOT_FOUND"},
        ) from error
