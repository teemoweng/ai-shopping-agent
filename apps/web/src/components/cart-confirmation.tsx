import type { components } from "@shopping-guide/contracts/src/api";

import { formatUsd } from "@/lib/formatters";
import { isCartItemResponse } from "@/lib/decision-contracts";

type CartPreviewResponse = components["schemas"]["CartPreviewResponse"];
type CartItemResponse = components["schemas"]["CartItemResponse"];

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
  onConfirm,
  onPreviewAgain,
  pending,
  previewPending = false,
  errorCode,
}: {
  preview: CartPreviewResponse;
  cartItem?: CartItemResponse | null;
  onConfirm: (token: string) => void;
  onPreviewAgain?: () => void;
  pending: boolean;
  previewPending?: boolean;
  errorCode: string | null;
}) {
  if (cartItem && isCartItemResponse(cartItem)) {
    return (
      <section className="cartSuccess" aria-live="polite">
        <span>Simulated transaction complete</span>
        <h2>Added to simulated cart</h2>
        <dl>
          <div>
            <dt>Cart item ID</dt>
            <dd>{cartItem.cart_item_id}</dd>
          </div>
          <div>
            <dt>SKU</dt>
            <dd>{cartItem.sku_id}</dd>
          </div>
          <div>
            <dt>Quantity</dt>
            <dd>{cartItem.quantity}</dd>
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
