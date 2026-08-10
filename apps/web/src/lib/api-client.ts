import type { components } from "@shopping-guide/contracts/src/api";

import {
  validateCommerceOperationResponse,
  validateComparisonResponse,
  validateGuideTurnResponse,
  validateProductDetailResponse,
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

export interface CommerceOperationExpectation {
  transactionRevision: number;
  purchaseOrigin: "FEED" | "AI";
  guideSessionId: string | null;
  sourceGuideRevision: number | null;
  productId: string;
  skuId: string;
  quantity: number;
  factsVersion: string;
  unitPriceUsd: number;
  subtotalUsd: number;
}

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

function assertGuideSessionOwnership(payload: unknown, sessionId: string) {
  if (
    isRecord(payload) &&
    typeof payload.session_id === "string" &&
    payload.session_id !== sessionId
  ) {
    throw new ApiError(200, "GUIDE_SESSION_MISMATCH");
  }
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
  get<ProductDetailResponse>(
    `/catalog/products/${encodeURIComponent(productId)}`,
    (payload) => validateProductDetailResponse(payload, productId),
  );

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
    (payload) => {
      assertGuideSessionOwnership(payload, sessionId);
      return validateGuideTurnResponse(payload);
    },
  );

export const sendGuideMessage = (
  sessionId: string,
  messageId: string,
  text: string,
  expectedConversationRevision: number,
) =>
  post<GuideTurn>(`/guide/sessions/${encodeURIComponent(sessionId)}/messages`, {
    message_id: messageId,
    text,
    expected_conversation_revision: expectedConversationRevision,
  }, (payload) => {
    assertGuideSessionOwnership(payload, sessionId);
    return validateGuideTurnResponse(payload);
  });

export const compareProducts = (
  sessionId: string,
  requestId: string,
  productIds: string[],
  expectedConversationRevision: number,
) =>
  post<CompareResponse>(`/guide/sessions/${encodeURIComponent(sessionId)}/compare`, {
    request_id: requestId,
    product_ids: productIds,
    expected_conversation_revision: expectedConversationRevision,
  }, (payload) => {
    assertGuideSessionOwnership(payload, sessionId);
    return validateComparisonResponse(payload, sessionId, productIds);
  });

export const previewCart = (sessionId: string, skuId: string) =>
  post<CartPreview>(`/guide/sessions/${encodeURIComponent(sessionId)}/cart/preview`, {
    sku_id: skuId,
    quantity: 1,
  });

export const addCartItem = (sessionId: string, confirmationToken: string) =>
  post<CartItem>(`/guide/sessions/${encodeURIComponent(sessionId)}/cart/items`, {
    confirmation_token: confirmationToken,
  });

export const previewCommerce = (request: CommercePreviewRequest) =>
  post<CommerceOperationResponse>(
    "/commerce/cart/preview",
    request,
    (payload) =>
      validateCommerceOperationResponse(payload, {
        confirmationSecretPolicy: "required",
        allowedViews: ["AWAITING_CONFIRMATION", "FACTS_CHANGED"],
        expected: {
          purchaseOrigin: request.purchase_origin,
          guideSessionId: request.guide_session_id ?? null,
          sourceGuideRevision: request.source_guide_revision ?? null,
          productId: request.product_id,
          skuId: request.sku_id,
          quantity: request.quantity,
          transactionRevisions: [request.expected_transaction_revision + 1],
        },
      }),
  );

export const acceptUpdatedFacts = (
  operationId: string,
  expectedRevision: number,
  expectedOperation: CommerceOperationExpectation,
) =>
  post<CommerceOperationResponse>(
    `/commerce/operations/${encodeURIComponent(operationId)}/accept-facts`,
    { expected_transaction_revision: expectedRevision },
    (payload) =>
      validateCommerceOperationResponse(payload, {
        confirmationSecretPolicy: "required",
        allowedViews: ["AWAITING_CONFIRMATION"],
        factsFingerprintViews: ["AWAITING_CONFIRMATION"],
        expected: {
          operationId,
          ...expectedOperation,
          transactionRevisions: [expectedRevision + 1],
        },
      }),
  );

export const confirmCommerce = (
  operationId: string,
  request: CommerceAddRequest,
  expectedOperation: CommerceOperationExpectation,
) =>
  post<CommerceOperationResponse>(
    `/commerce/operations/${encodeURIComponent(operationId)}/items`,
    request,
    (payload) =>
      validateCommerceOperationResponse(payload, {
        confirmationSecretPolicy: "forbidden",
        allowedViews: [
          "SUCCEEDED",
          "COMMIT_STATUS_UNKNOWN",
          "FACTS_CHANGED",
        ],
        transactionRevisionsByView: {
          SUCCEEDED: [request.expected_transaction_revision],
          COMMIT_STATUS_UNKNOWN: [request.expected_transaction_revision],
          FACTS_CHANGED: [request.expected_transaction_revision + 1],
        },
        factsFingerprintViews: ["SUCCEEDED", "COMMIT_STATUS_UNKNOWN"],
        requireFactsDiffForViews: ["FACTS_CHANGED"],
        expected: {
          operationId,
          ...expectedOperation,
          idempotencyKey: request.idempotency_key,
        },
      }),
  );

export const getCommerceOperation = (operationId: string) =>
  get<CommerceOperationResponse>(
    `/commerce/operations/${encodeURIComponent(operationId)}`,
    (payload) =>
      validateCommerceOperationResponse(payload, {
        confirmationSecretPolicy: "forbidden",
        expected: { operationId },
      }),
  );

export const reconcileCommerce = (
  idempotencyKey: string,
  expectedOperation: CommerceOperationExpectation,
) =>
  get<CommerceOperationResponse>(
    `/commerce/operations/by-idempotency/${encodeURIComponent(idempotencyKey)}`,
    (payload) =>
      validateCommerceOperationResponse(payload, {
        confirmationSecretPolicy: "forbidden",
        allowedViews: ["SUCCEEDED"],
        transactionRevisionsByView: {
          SUCCEEDED: [expectedOperation.transactionRevision],
        },
        factsFingerprintViews: ["SUCCEEDED"],
        expected: {
          ...expectedOperation,
          idempotencyKey,
        },
      }),
  );
