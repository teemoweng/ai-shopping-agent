from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import commerce
from app.domain.contracts import (
    CommerceAcceptFactsRequest,
    CommerceAddRequest,
    CommerceOperationResponse,
    CommercePreviewRequest,
)
from app.services.commerce_service import CommerceConflict, CommerceService

router = APIRouter(prefix="/commerce", tags=["commerce"])


def get_commerce_service() -> CommerceService:
    return commerce


CommerceServiceDependency = Annotated[CommerceService, Depends(get_commerce_service)]


def commerce_conflict(error: CommerceConflict) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": error.code,
            "message": "The commerce operation cannot apply that action.",
        },
    )


def commerce_not_found(code: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "code": code,
            "message": "The requested commerce record does not exist.",
        },
    )


@router.post(
    "/cart/preview",
    response_model=CommerceOperationResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def preview(
    request: CommercePreviewRequest,
    commerce_service: CommerceServiceDependency,
) -> CommerceOperationResponse:
    try:
        return commerce_service.preview(request)
    except CommerceConflict as error:
        raise commerce_conflict(error) from error
    except KeyError as error:
        raise commerce_not_found("PRODUCT_NOT_FOUND") from error


@router.post(
    "/operations/{operation_id}/accept-facts",
    response_model=CommerceOperationResponse,
    response_model_exclude_none=True,
)
def accept_facts(
    operation_id: str,
    request: CommerceAcceptFactsRequest,
    commerce_service: CommerceServiceDependency,
) -> CommerceOperationResponse:
    try:
        return commerce_service.accept_facts(operation_id, request)
    except CommerceConflict as error:
        raise commerce_conflict(error) from error
    except KeyError as error:
        raise commerce_not_found("COMMERCE_OPERATION_NOT_FOUND") from error


@router.post(
    "/operations/{operation_id}/items",
    response_model=CommerceOperationResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
def add_item(
    operation_id: str,
    request: CommerceAddRequest,
    commerce_service: CommerceServiceDependency,
) -> CommerceOperationResponse:
    try:
        return commerce_service.add_item(operation_id, request)
    except CommerceConflict as error:
        raise commerce_conflict(error) from error
    except KeyError as error:
        raise commerce_not_found("COMMERCE_OPERATION_NOT_FOUND") from error


@router.get(
    "/operations/by-idempotency/{idempotency_key}",
    response_model=CommerceOperationResponse,
    response_model_exclude_none=True,
)
def get_by_idempotency_key(
    idempotency_key: str,
    commerce_service: CommerceServiceDependency,
) -> CommerceOperationResponse:
    try:
        return commerce_service.get_by_idempotency_key(idempotency_key)
    except KeyError as error:
        raise commerce_not_found("IDEMPOTENCY_KEY_NOT_FOUND") from error


@router.get(
    "/operations/{operation_id}",
    response_model=CommerceOperationResponse,
    response_model_exclude_none=True,
)
def get_operation(
    operation_id: str,
    commerce_service: CommerceServiceDependency,
) -> CommerceOperationResponse:
    try:
        return commerce_service.get_operation(operation_id)
    except KeyError as error:
        raise commerce_not_found("COMMERCE_OPERATION_NOT_FOUND") from error
