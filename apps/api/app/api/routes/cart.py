from fastapi import APIRouter, HTTPException, status

from app.dependencies import fixtures, sessions
from app.domain.contracts import (
    AddCartItemRequest,
    CartItemResponse,
    CartPreviewRequest,
    CartPreviewResponse,
    CompareRequest,
    CompareResponse,
)
from app.services.cart_service import CartConflict, CartService

router = APIRouter(prefix="/guide/sessions/{session_id}", tags=["decision"])
service = CartService(fixtures, sessions)


def conflict(error: CartConflict) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": str(error),
            "message": "The requested decision action is not valid for this session.",
        },
    )


def session_not_found(error: KeyError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "code": "SESSION_NOT_FOUND",
            "message": "Guide session does not exist.",
        },
    )


@router.post("/compare", response_model=CompareResponse)
def compare(session_id: str, request: CompareRequest) -> CompareResponse:
    try:
        return service.compare(session_id, request)
    except CartConflict as error:
        raise conflict(error) from error
    except KeyError as error:
        raise session_not_found(error) from error


@router.post("/cart/preview", response_model=CartPreviewResponse)
def preview(session_id: str, request: CartPreviewRequest) -> CartPreviewResponse:
    try:
        return service.preview(session_id, request)
    except CartConflict as error:
        raise conflict(error) from error
    except KeyError as error:
        raise session_not_found(error) from error


@router.post(
    "/cart/items",
    response_model=CartItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def add(session_id: str, request: AddCartItemRequest) -> CartItemResponse:
    try:
        return service.add(session_id, request.confirmation_token)
    except CartConflict as error:
        raise conflict(error) from error
    except KeyError as error:
        raise session_not_found(error) from error
