import type { components } from "@shopping-guide/contracts/src/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

type GuideTurn = components["schemas"]["GuideTurnResponse"];
type CompareResponse = components["schemas"]["CompareResponse"];
type CartPreview = components["schemas"]["CartPreviewResponse"];
type CartItem = components["schemas"]["CartItemResponse"];

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

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, getApiErrorCode(payload));
  }
  if (!isRecord(payload)) {
    throw new ApiError(response.status, "INVALID_API_RESPONSE");
  }
  return payload as T;
}

export const createGuideSession = (contentContextId: string) =>
  post<GuideTurn>("/guide/sessions", {
    entry_point: "content",
    content_context_id: contentContextId,
  });

export const sendGuideMessage = (
  sessionId: string,
  messageId: string,
  text: string,
) =>
  post<GuideTurn>(`/guide/sessions/${sessionId}/messages`, {
    message_id: messageId,
    text,
  });

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
