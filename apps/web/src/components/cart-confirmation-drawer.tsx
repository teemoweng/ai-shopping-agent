"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { formatUsd } from "@/lib/formatters";

type CommerceOperation = components["schemas"]["CommerceOperationResponse"];
type CommerceAction = components["schemas"]["CommerceAction"];

function hasAction(operation: CommerceOperation, action: CommerceAction) {
  return operation.allowed_actions.includes(action);
}

export interface CartConfirmationDrawerProps {
  open: boolean;
  operation: CommerceOperation | null;
  pending?: boolean;
  commitStatusUnknown?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onAcceptFacts: () => void;
  onReselect: () => void;
  onReconcile: () => void;
}

export function CartConfirmationDrawer({
  open,
  operation,
  pending = false,
  commitStatusUnknown = false,
  errorMessage = null,
  onCancel,
  onConfirm,
  onAcceptFacts,
  onReselect,
  onReconcile,
}: CartConfirmationDrawerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !operation) return;
    (cancelRef.current ??
      primaryRef.current ??
      dialogRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  }, [commitStatusUnknown, open, operation]);

  if (!open || !operation) return null;

  const portalTarget =
    document.querySelector<HTMLElement>(".phoneOverlayHost") ?? document.body;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key === "Escape" &&
      !pending &&
      operation &&
      (commitStatusUnknown || hasAction(operation, "CANCEL_CONFIRMATION"))
    ) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const facts = operation.facts;
  const isUnknown =
    commitStatusUnknown || operation.commerce_view_kind === "COMMIT_STATUS_UNKNOWN";
  const factsChanged = operation.commerce_view_kind === "FACTS_CHANGED";
  const outOfStock = factsChanged && !facts.in_stock;
  const title = isUnknown
    ? "加购结果待对账"
    : outOfStock
    ? "当前规格已缺货"
    : factsChanged
      ? "商品事实已更新"
      : "复核模拟加购";
  const canCancel = hasAction(operation, "CANCEL_CONFIRMATION");

  function formatDiffValue(field: string, value: string | number | boolean | null) {
    if (field === "unit_price_usd" && typeof value === "number") return formatUsd(value);
    if (field === "inventory_units" && typeof value === "number") return `${value} 件`;
    if (field === "in_stock" && typeof value === "boolean") return value ? "有货" : "缺货";
    return String(value ?? "—");
  }

  const diffLabels: Record<string, string> = {
    unit_price_usd: "单价",
    inventory_units: "库存",
    in_stock: "库存状态",
    facts_version: "事实版本",
  };

  function formatObservedAt(timestamp: string) {
    const observed = new Date(timestamp);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${observed.getUTCFullYear()}/${pad(observed.getUTCMonth() + 1)}/${pad(observed.getUTCDate())} ${pad(observed.getUTCHours())}:${pad(observed.getUTCMinutes())} UTC`;
  }
  return createPortal(
    <div className="commerceBackdrop">
      <div
        ref={dialogRef}
        className="commerceDrawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-confirm-title"
        onKeyDown={handleKeyDown}
      >
        <span className="commerceHandle" aria-hidden="true" />
        <header>
          <div>
            <span>事实观测时间：{formatObservedAt(facts.observed_at)}</span>
            <h2 id="cart-confirm-title">{title}</h2>
          </div>
          <strong>模拟</strong>
        </header>
        <dl className="commerceFactList">
          <div>
            <dt>规格</dt>
            <dd>{facts.sku_id}</dd>
          </div>
          <div>
            <dt>单价</dt>
            <dd>{formatUsd(facts.unit_price_usd)}</dd>
          </div>
          <div>
            <dt>库存</dt>
            <dd>{facts.inventory_units} 件</dd>
          </div>
          <div>
            <dt>数量</dt>
            <dd>数量 {facts.quantity}</dd>
          </div>
          <div className="commerceFactTotal">
            <dt>小计</dt>
            <dd>{formatUsd(facts.subtotal_usd)}</dd>
          </div>
        </dl>
        {factsChanged && operation.facts_diff?.length ? (
          <section className="commerceFactsDiff" aria-label="事实变更明细">
            {operation.facts_diff.map((diff) => (
              <div key={diff.field}>
                <span>{diffLabels[diff.field] ?? diff.field}</span>
                <del>{formatDiffValue(diff.field, diff.previous_value)}</del>
                <span aria-hidden="true">→</span>
                <ins>{formatDiffValue(diff.field, diff.current_value)}</ins>
              </div>
            ))}
          </section>
        ) : null}
        {errorMessage ? (
          <p className="commerceInlineError" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <p className="commerceBoundaryCopy">
          {isUnknown
            ? "不要重复提交加购；请使用原操作标识查询最终结果。"
            : "本次操作不会创建真实订单或支付。"}
        </p>
        <footer>
          {isUnknown ? (
            <>
              <button ref={cancelRef} type="button" disabled={pending} onClick={onCancel}>
                返回商品
              </button>
              <button
                ref={primaryRef}
                className="commercePrimaryAction"
                type="button"
                disabled={pending}
                onClick={onReconcile}
              >
                {pending ? "正在查询" : "查询加购结果"}
              </button>
            </>
          ) : canCancel ? (
            <button ref={cancelRef} type="button" disabled={pending} onClick={onCancel}>
              取消
            </button>
          ) : null}
          {!isUnknown && hasAction(operation, "CONFIRM_ADD_TO_CART") ? (
            <button
              ref={primaryRef}
              className="commercePrimaryAction"
              type="button"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? "正在模拟加购" : "确认模拟加购"}
            </button>
          ) : null}
          {!isUnknown && hasAction(operation, "ACCEPT_UPDATED_FACTS") ? (
            <button
              ref={primaryRef}
              className="commercePrimaryAction"
              type="button"
              disabled={pending}
              onClick={onAcceptFacts}
            >
              {pending ? "正在接受新事实" : "接受新事实并继续"}
            </button>
          ) : null}
          {!isUnknown && hasAction(operation, "RESELECT_SKU") && !canCancel ? (
            <button
              ref={primaryRef}
              className="commercePrimaryAction"
              type="button"
              disabled={pending}
              onClick={onReselect}
            >
              重新选择规格
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    portalTarget,
  );
}
