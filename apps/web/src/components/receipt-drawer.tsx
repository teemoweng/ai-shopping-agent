"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { formatUsd } from "@/lib/formatters";

type CommerceOperation = components["schemas"]["CommerceOperationResponse"];

export interface ReceiptDrawerProps {
  open: boolean;
  operation: CommerceOperation | null;
  onReturnProduct: () => void;
  onContinueBrowsing: () => void;
}

export function ReceiptDrawer({
  open,
  operation,
  onReturnProduct,
  onContinueBrowsing,
}: ReceiptDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    returnRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open || operation?.commerce_view_kind !== "SUCCEEDED" || !operation.receipt) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onReturnProduct();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="commerceBackdrop commerceReceiptBackdrop">
      <div
        ref={dialogRef}
        className="commerceDrawer receiptDrawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
        onKeyDown={handleKeyDown}
      >
        <span className="commerceHandle" aria-hidden="true" />
        <div className="receiptSuccessMark" aria-hidden="true">✓</div>
        <h2 id="receipt-title">模拟加购回执</h2>
        <strong>模拟加购成功</strong>
        <p>商品已加入本地演示购物车，未创建订单或支付。</p>
        <dl className="receiptSummary">
          <div>
            <dt>数量</dt>
            <dd>{operation.receipt.quantity}</dd>
          </div>
          <div>
            <dt>小计</dt>
            <dd>{formatUsd(operation.receipt.subtotal_usd)}</dd>
          </div>
        </dl>
        <footer>
          <button ref={returnRef} type="button" onClick={onReturnProduct}>
            返回商品
          </button>
          <button type="button" onClick={onContinueBrowsing}>
            继续浏览
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
