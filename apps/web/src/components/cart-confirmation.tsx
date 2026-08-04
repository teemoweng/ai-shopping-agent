import type { components } from "@shopping-guide/contracts/src/api";

import { formatUsd } from "@/lib/formatters";
import { isCartItemResponse } from "@/lib/decision-contracts";

type CartPreviewResponse = components["schemas"]["CartPreviewResponse"];
type CartItemResponse = components["schemas"]["CartItemResponse"];
type GuideTurnResponse = components["schemas"]["GuideTurnResponse"];

const confirmationErrorMessages: Record<string, string> = {
  TOKEN_ALREADY_USED: "This confirmation was already used",
  PRICE_CHANGED: "The price changed. Preview again to review the latest price.",
  INSUFFICIENT_STOCK: "Stock changed. Choose another size or preview again.",
  INVALID_CONFIRMATION_TOKEN:
    "This confirmation is no longer valid. Preview again.",
  INVALID_CART_ITEM_RESPONSE:
    "The simulated cart response was incomplete. Preview again before retrying.",
};

export function CartConfirmation({
  preview,
  cartItem,
  turn,
  onConfirm,
  onPreviewAgain,
  pending,
  previewPending = false,
  errorCode,
}: {
  preview: CartPreviewResponse;
  cartItem?: CartItemResponse | null;
  turn: GuideTurnResponse;
  onConfirm: (token: string) => void;
  onPreviewAgain?: () => void;
  pending: boolean;
  previewPending?: boolean;
  errorCode: string | null;
}) {
  if (cartItem && isCartItemResponse(cartItem)) {
    const recommendation =
      turn.kind === "recommendation"
        ? (turn.recommendations ?? []).find((candidate) =>
            candidate.eligible_sku_ids.includes(preview.sku_id),
          )
        : undefined;
    const citedEvidence = (turn.evidence ?? []).filter((evidence) =>
      recommendation?.evidence_ids.includes(evidence.evidence_id),
    );
    const evidenceCount = citedEvidence.length;
    const publicEvidenceCount = citedEvidence.filter(
      (evidence) => evidence.source_kind === "public_rule" && !evidence.synthetic,
    ).length;
    const evidenceKind =
      publicEvidenceCount === evidenceCount && evidenceCount > 0
        ? "public source"
        : "cited source";
    const evidenceSummary = `${evidenceCount} ${evidenceKind}${
      evidenceCount === 1 ? "" : "s"
    } · ${citedEvidence[0]?.title ?? "No cited evidence"}`;
    const verdict = recommendation?.verdict
      ? recommendation.verdict
          .toLowerCase()
          .replaceAll("_", " ")
          .replace(/^./, (letter) => letter.toUpperCase())
      : "Recommendation recorded";

    return (
      <section
        className="cartSuccess decisionReceipt"
        aria-label="Simulated cart decision receipt"
        aria-live="polite"
      >
        <div className="decisionReceiptHeader">
          <div>
            <span>Decision receipt</span>
            <h2>Added to simulated cart</h2>
          </div>
          <strong>Simulated</strong>
        </div>
        <p className="decisionReceiptContext">
          {turn.context.creator_handle} · {turn.context.anchor_product_name}
        </p>
        <div className="decisionReceiptRecommendation">
          <span>Recommendation</span>
          <strong>
            {recommendation?.name ?? turn.context.anchor_product_name} · {verdict}
          </strong>
          <small>{evidenceSummary}</small>
        </div>
        <dl className="decisionReceiptFacts">
          <div className="decisionReceiptSku">
            <dt>SKU</dt>
            <dd>{cartItem.sku_id}</dd>
          </div>
          <div>
            <dt>Unit price</dt>
            <dd>{formatUsd(preview.unit_price_usd)}</dd>
          </div>
          <div>
            <dt>Preview-time stock</dt>
            <dd>{preview.inventory_units} units at preview</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>Quantity {cartItem.quantity}</dd>
          </div>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatUsd(preview.subtotal_usd)}</dd>
          </div>
          <div className="decisionReceiptReference">
            <dt>Cart item ID</dt>
            <dd>{cartItem.cart_item_id}</dd>
          </div>
        </dl>
        <p>This was simulated—no order or payment was created.</p>
      </section>
    );
  }

  const errorMessage = errorCode
    ? confirmationErrorMessages[errorCode] ??
      "The simulated add could not be confirmed. Preview again before retrying."
    : null;

  return (
    <section
      className="cartConfirmation"
      role="region"
      aria-label="Simulated cart preview"
    >
      <div className="receiptHeader">
        <div>
          <span>Current price and stock</span>
          <h2>Simulated cart preview</h2>
        </div>
        <strong>Simulated</strong>
      </div>
      <dl className="receiptFacts">
        <div>
          <dt>SKU</dt>
          <dd>{preview.sku_id}</dd>
        </div>
        <div>
          <dt>Unit price</dt>
          <dd>{formatUsd(preview.unit_price_usd)}</dd>
        </div>
        <div>
          <dt>Inventory</dt>
          <dd>{preview.inventory_units} units available</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>Quantity {preview.quantity}</dd>
        </div>
        <div className="receiptTotal">
          <dt>Subtotal</dt>
          <dd>{formatUsd(preview.subtotal_usd)}</dd>
        </div>
      </dl>
      <p className="prototypeCaution">
        This is a prototype—no order or payment will be created
      </p>
      {errorMessage ? (
        <div className="transactionError" role="alert">
          <p>{errorMessage}</p>
          <button
            type="button"
            disabled={previewPending || !onPreviewAgain}
            onClick={onPreviewAgain}
          >
            Preview again
          </button>
        </div>
      ) : (
        <button
          className="confirmSimulatedButton"
          type="button"
          disabled={pending}
          onClick={() => onConfirm(preview.confirmation_token)}
        >
          Confirm simulated add
        </button>
      )}
    </section>
  );
}
