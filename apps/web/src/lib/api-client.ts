import type { components } from "@shopping-guide/contracts/src/api";

import {
  validateCommerceOperationResponse,
  validateGuideTurnResponse,
} from "@/lib/decision-contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type CompareResponse = components["schemas"]["CompareResponse"];
type CartPreview = components["schemas"]["CartPreviewResponse"];
type CartItem = components["schemas"]["CartItemResponse"];
type FeedResponse = components["schemas"]["FeedResponse"];
type ProductDetailResponse = components["schemas"]["ProductDetailResponse"];
type CommercePreviewRequest = components["schemas"]["CommercePreviewRequest"];
type CommerceAddRequest = components["schemas"]["CommerceAddRequest"];
type CommerceOperationResponse =
  components["schemas"]["CommerceOperationResponse"];

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return undefined;
  }
  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function getApiErrorCode(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.detail)) {
    return "UNKNOWN_API_ERROR";
  }

  return typeof payload.detail.code === "string"
    ? payload.detail.code
    : "UNKNOWN_API_ERROR";
}

type ResponseGuard<T> = (payload: unknown) => T | null;

async function post<T>(
  path: string,
  body: unknown,
  guard?: ResponseGuard<T>,
): Promise<T> {
  return request<T>(path, "POST", body, guard);
}

async function get<T>(path: string, guard?: ResponseGuard<T>): Promise<T> {
  return request<T>(path, "GET", undefined, guard);
}

async function request<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  guard?: ResponseGuard<T>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, getApiErrorCode(payload));
  }
  if (!isRecord(payload)) {
    throw new ApiError(response.status, "INVALID_API_RESPONSE");
  }
  if (guard) {
    const validated = guard(payload);
    if (!validated) {
      throw new ApiError(response.status, "INVALID_API_RESPONSE");
    }
    return validated;
  }
  return payload as T;
}

export const getFeed = () => get<FeedResponse>("/catalog/feed");

export const getProduct = (productId: string) =>
  get<ProductDetailResponse>(`/catalog/products/${encodeURIComponent(productId)}`);

export const createGuideSession = (
  contentContextId: string,
  locale?: "zh-CN" | "en-US",
) =>
  post<GuideTurn>("/guide/sessions", {
    entry_point: "content",
    content_context_id: contentContextId,
    ...(locale ? { locale } : {}),
  }, validateGuideTurnResponse);

export const getGuideSession = (sessionId: string) =>
  get<GuideTurn>(
    `/guide/sessions/${encodeURIComponent(sessionId)}`,
    validateGuideTurnResponse,
  );

export const sendGuideMessage = (
  sessionId: string,
  messageId: string,
  text: string,
) =>
  post<GuideTurn>(`/guide/sessions/${sessionId}/messages`, {
    message_id: messageId,
    text,
  }, validateGuideTurnResponse);

export const compareProducts = (sessionId: string, productIds: string[]) =>
  post<CompareResponse>(`/guide/sessions/${sessionId}/compare`, {
    product_ids: productIds,
  });

export const previewCart = (sessionId: string, skuId: string) =>
  post<CartPreview>(`/guide/sessions/${sessionId}/cart/preview`, {
    sku_id: skuId,
    quantity: 1,
  });

export const addCartItem = (sessionId: string, confirmationToken: string) =>
  post<CartItem>(`/guide/sessions/${sessionId}/cart/items`, {
    confirmation_token: confirmationToken,
  });

export const previewCommerce = (request: CommercePreviewRequest) =>
  post<CommerceOperationResponse>(
    "/commerce/cart/preview",
    request,
    validateCommerceOperationResponse,
  );

export const acceptUpdatedFacts = (
  operationId: string,
  expectedRevision: number,
) =>
  post<CommerceOperationResponse>(
    `/commerce/operations/${encodeURIComponent(operationId)}/accept-facts`,
    { expected_transaction_revision: expectedRevision },
    validateCommerceOperationResponse,
  );

export const confirmCommerce = (
  operationId: string,
  request: CommerceAddRequest,
) =>
  post<CommerceOperationResponse>(
    `/commerce/operations/${encodeURIComponent(operationId)}/items`,
    request,
    validateCommerceOperationResponse,
  );

export const getCommerceOperation = (operationId: string) =>
  get<CommerceOperationResponse>(
    `/commerce/operations/${encodeURIComponent(operationId)}`,
    validateCommerceOperationResponse,
  );

export const reconcileCommerce = (idempotencyKey: string) =>
  get<CommerceOperationResponse>(
    `/commerce/operations/by-idempotency/${encodeURIComponent(idempotencyKey)}`,
    validateCommerceOperationResponse,
  );
