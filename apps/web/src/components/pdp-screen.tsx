"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ApiError,
  acceptUpdatedFacts,
  confirmCommerce,
  getGuideSession,
  getProduct,
  previewCommerce,
  reconcileCommerce,
} from "@/lib/api-client";
import type { Overlay, PdpEntrySource, ProductRole } from "@/lib/demo-navigation";
import { formatUsd } from "@/lib/formatters";

import { CartConfirmationDrawer } from "./cart-confirmation-drawer";
import { ReceiptDrawer } from "./receipt-drawer";

type ProductDetail = components["schemas"]["ProductDetailResponse"];
type CommerceOperation = components["schemas"]["CommerceOperationResponse"];
type CommercePreviewRequest = components["schemas"]["CommercePreviewRequest"];

function hasFreshCatalogFacts(detail: ProductDetail, now = Date.now()) {
  const observedAt = Date.parse(detail.freshness.observed_at);
  const expiresAt = Date.parse(detail.freshness.expires_at);
  return (
    Number.isFinite(observedAt) &&
    Number.isFinite(expiresAt) &&
    observedAt <= now &&
    expiresAt > now
  );
}

export interface PdpGuideCandidate {
  sessionId: string;
  guideRevision: number;
  productRole: ProductRole;
}

export interface PdpScreenProps {
  productId: string;
  entrySource: PdpEntrySource;
  productRole: ProductRole;
  guideCandidate?: PdpGuideCandidate | null;
  backButtonRef?: (node: HTMLButtonElement | null) => void;
  onBack: () => void;
  onNotice: (message: string) => void;
  onCommerceOperation: (operation: CommerceOperation) => void;
  overlay: Overlay;
  onCloseOverlay: () => void;
  onContinueBrowsing: () => void;
  cartCount: number;
}

export function PdpScreen({
  productId,
  entrySource,
  productRole,
  guideCandidate = null,
  backButtonRef,
  onBack,
  onNotice,
  onCommerceOperation,
  overlay,
  onCloseOverlay,
  onContinueBrowsing,
  cartCount,
}: PdpScreenProps) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [previewPending, setPreviewPending] = useState(false);
  const [verifiedGuide, setVerifiedGuide] = useState<PdpGuideCandidate | null>(null);
  const [guideCheckPending, setGuideCheckPending] = useState(false);
  const [guideAttributionUnavailable, setGuideAttributionUnavailable] = useState(false);
  const [commerceOperation, setCommerceOperation] = useState<CommerceOperation | null>(null);
  const [commitStatusUnknown, setCommitStatusUnknown] = useState(false);
  const localBackRef = useRef<HTMLButtonElement | null>(null);
  const loadVersionRef = useRef(0);
  const previewPendingRef = useRef(false);
  const previewVersionRef = useRef(0);
  const selectionVersionRef = useRef(0);
  const confirmPendingRef = useRef(false);
  const reconcilePendingRef = useRef(false);
  const commerceActionVersionRef = useRef(0);
  const idempotencyKeyRef = useRef<string | null>(null);
  const guideVersionRef = useRef(0);
  const skuSelectorRef = useRef<HTMLFieldSetElement>(null);

  function setBackButton(node: HTMLButtonElement | null) {
    localBackRef.current = node;
    backButtonRef?.(node);
  }

  useEffect(() => {
    const version = ++loadVersionRef.current;
    selectionVersionRef.current += 1;
    previewVersionRef.current += 1;
    commerceActionVersionRef.current += 1;
    previewPendingRef.current = false;
    queueMicrotask(() => {
      if (loadVersionRef.current !== version) return;
      setDetail(null);
      setLoadError(false);
      setSelectedSkuId(null);
      setQuantity(1);
      setPreviewPending(false);
      setCommerceOperation(null);
      setCommitStatusUnknown(false);
      idempotencyKeyRef.current = null;
    });
    void getProduct(productId)
      .then((nextDetail) => {
        if (loadVersionRef.current !== version) return;
        setDetail(nextDetail);
        setSelectedSkuId(
          nextDetail.product.skus.find(
            (sku) => sku.in_stock && sku.inventory_units > 0,
          )?.id ?? null,
        );
      })
      .catch(() => {
        if (loadVersionRef.current === version) setLoadError(true);
      });
    return () => {
      loadVersionRef.current += 1;
      previewVersionRef.current += 1;
      commerceActionVersionRef.current += 1;
    };
  }, [productId]);

  useEffect(() => {
    const version = ++guideVersionRef.current;
    if (entrySource !== "ai" || !guideCandidate) {
      queueMicrotask(() => {
        if (guideVersionRef.current !== version) return;
        setVerifiedGuide(null);
        setGuideAttributionUnavailable(false);
        setGuideCheckPending(false);
      });
      return;
    }
    queueMicrotask(() => {
      if (guideVersionRef.current !== version) return;
      setVerifiedGuide(null);
      setGuideAttributionUnavailable(false);
      setGuideCheckPending(true);
    });
    void getGuideSession(guideCandidate.sessionId)
      .then((turn) => {
        if (guideVersionRef.current !== version) return;
        const isCurrent =
          guideCandidate.productRole === "current" &&
          turn.context.anchor_product_id === productId;
        const isAlternative =
          guideCandidate.productRole === "alternative" &&
          turn.context.anchor_product_id !== productId &&
          ((turn.recommendations ?? []).some(
            (recommendation) => recommendation.product_id === productId,
          ) ||
            Boolean(turn.comparison?.product_ids.includes(productId)));
        const authorized =
          turn.session_id === guideCandidate.sessionId &&
          turn.guide_revision === guideCandidate.guideRevision &&
          turn.allowed_actions.includes("OPEN_PRODUCT") &&
          (isCurrent || isAlternative);
        setVerifiedGuide(authorized ? guideCandidate : null);
        setGuideAttributionUnavailable(!authorized);
      })
      .catch(() => {
        if (guideVersionRef.current === version) {
          setVerifiedGuide(null);
          setGuideAttributionUnavailable(true);
        }
      })
      .finally(() => {
        if (guideVersionRef.current === version) setGuideCheckPending(false);
      });
    return () => {
      guideVersionRef.current += 1;
    };
  }, [entrySource, guideCandidate, productId]);

  useEffect(() => {
    if (detail || loadError) localBackRef.current?.focus();
  }, [detail, loadError]);

  const selectedSku = useMemo(
    () => detail?.product.skus.find((sku) => sku.id === selectedSkuId) ?? null,
    [detail, selectedSkuId],
  );

  async function preview() {
    if (
      !detail ||
      !selectedSku ||
      !selectedSku.in_stock ||
      !hasFreshCatalogFacts(detail) ||
      previewPendingRef.current
    ) {
      return;
    }
    previewPendingRef.current = true;
    setPreviewPending(true);
    const previewVersion = ++previewVersionRef.current;
    const selectionVersion = selectionVersionRef.current;
    const previousOperation = commerceOperation;
    const request: CommercePreviewRequest = {
      purchase_origin: verifiedGuide ? "AI" : "FEED",
      ...(verifiedGuide
        ? {
            guide_session_id: verifiedGuide.sessionId,
            source_guide_revision: verifiedGuide.guideRevision,
          }
        : {}),
      product_id: detail.product.id,
      sku_id: selectedSku.id,
      quantity,
      ...(previousOperation
        ? { previous_operation_id: previousOperation.operation_id }
        : {}),
      expected_transaction_revision:
        previousOperation?.transaction_revision ?? 0,
      demo_scenario: "NORMAL",
    };
    try {
      const operation = await previewCommerce(request);
      const responseMatchesRequest =
        operation.product_id === request.product_id &&
        operation.sku_id === request.sku_id &&
        operation.quantity === request.quantity &&
        operation.purchase_origin === request.purchase_origin &&
        operation.transaction_revision ===
          request.expected_transaction_revision + 1 &&
        (request.purchase_origin === "FEED"
          ? !operation.guide_session_id && !operation.source_guide_revision
          : operation.guide_session_id === request.guide_session_id &&
            operation.source_guide_revision === request.source_guide_revision);
      if (
        previewVersionRef.current !== previewVersion ||
        selectionVersionRef.current !== selectionVersion ||
        !responseMatchesRequest
      ) {
        if (previewVersionRef.current === previewVersion) {
          onNotice("商品复核结果与当前选择不一致，请重新尝试");
        }
        return;
      }
      idempotencyKeyRef.current = null;
      setCommitStatusUnknown(false);
      setCommerceOperation(operation);
      onCommerceOperation(operation);
    } catch {
      onNotice("商品事实暂时无法复核，请稍后重试");
    } finally {
      previewPendingRef.current = false;
      setPreviewPending(false);
    }
  }

  async function confirm() {
    if (
      !commerceOperation ||
      commerceOperation.commerce_view_kind !== "AWAITING_CONFIRMATION" ||
      !commerceOperation.allowed_actions.includes("CONFIRM_ADD_TO_CART") ||
      !commerceOperation.confirmation_token ||
      confirmPendingRef.current
    ) {
      return;
    }
    confirmPendingRef.current = true;
    setPreviewPending(true);
    const actionVersion = ++commerceActionVersionRef.current;
    const idempotencyKey =
      idempotencyKeyRef.current ??
      `idem_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`}`;
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const operation = await confirmCommerce(commerceOperation.operation_id, {
        confirmation_token: commerceOperation.confirmation_token,
        idempotency_key: idempotencyKey,
        expected_transaction_revision: commerceOperation.transaction_revision,
        demo_scenario: "NORMAL",
      });
      if (commerceActionVersionRef.current !== actionVersion) return;
      const matchesConfirmation =
        operation.operation_id === commerceOperation.operation_id &&
        operation.purchase_origin === commerceOperation.purchase_origin &&
        (operation.guide_session_id ?? null) ===
          (commerceOperation.guide_session_id ?? null) &&
        (operation.source_guide_revision ?? null) ===
          (commerceOperation.source_guide_revision ?? null) &&
        operation.product_id === commerceOperation.product_id &&
        operation.sku_id === commerceOperation.sku_id &&
        operation.quantity === commerceOperation.quantity &&
        (operation.transaction_revision === commerceOperation.transaction_revision ||
          operation.transaction_revision === commerceOperation.transaction_revision + 1) &&
        (operation.commerce_view_kind !== "SUCCEEDED" ||
          operation.receipt?.idempotency_key === idempotencyKey);
      if (!matchesConfirmation) {
        onNotice("模拟加购响应与当前操作不一致，请返回商品重试");
        return;
      }
      setCommitStatusUnknown(operation.commerce_view_kind === "COMMIT_STATUS_UNKNOWN");
      setCommerceOperation(operation);
      onCommerceOperation(operation);
    } catch (error) {
      if (commerceActionVersionRef.current !== actionVersion) return;
      const uncertain =
        !(error instanceof ApiError) ||
        error.status >= 500 ||
        error.code === "INVALID_API_RESPONSE" ||
        (error.status === 409 && error.code === "COMMIT_STATUS_UNKNOWN");
      if (uncertain) {
        setCommitStatusUnknown(true);
      } else {
        onNotice("模拟加购未完成，请重新复核商品事实");
      }
    } finally {
      confirmPendingRef.current = false;
      if (commerceActionVersionRef.current === actionVersion) {
        setPreviewPending(false);
      }
    }
  }

  async function acceptFacts() {
    if (
      !commerceOperation ||
      commerceOperation.commerce_view_kind !== "FACTS_CHANGED" ||
      !commerceOperation.allowed_actions.includes("ACCEPT_UPDATED_FACTS") ||
      previewPendingRef.current
    ) {
      return;
    }
    previewPendingRef.current = true;
    setPreviewPending(true);
    const actionVersion = ++commerceActionVersionRef.current;
    const current = commerceOperation;
    try {
      const operation = await acceptUpdatedFacts(
        current.operation_id,
        current.transaction_revision,
      );
      if (commerceActionVersionRef.current !== actionVersion) return;
      if (
        operation.operation_id !== current.operation_id ||
        operation.transaction_revision !== current.transaction_revision + 1 ||
        operation.product_id !== current.product_id ||
        operation.sku_id !== current.sku_id ||
        operation.quantity !== current.quantity
      ) {
        onNotice("更新后的商品事实与当前操作不一致，请重新尝试");
        return;
      }
      idempotencyKeyRef.current = null;
      setCommitStatusUnknown(false);
      setCommerceOperation(operation);
    } catch {
      if (commerceActionVersionRef.current === actionVersion) {
        onNotice("更新后的商品事实暂时无法确认，请重新尝试");
      }
    } finally {
      previewPendingRef.current = false;
      if (commerceActionVersionRef.current === actionVersion) {
        setPreviewPending(false);
      }
    }
  }

  function reselectSku() {
    onCloseOverlay();
    window.setTimeout(() => skuSelectorRef.current?.focus(), 0);
  }

  async function reconcile() {
    const idempotencyKey = idempotencyKeyRef.current;
    const current = commerceOperation;
    if (!idempotencyKey || !current || reconcilePendingRef.current) return;
    reconcilePendingRef.current = true;
    setPreviewPending(true);
    const actionVersion = ++commerceActionVersionRef.current;
    try {
      const operation = await reconcileCommerce(idempotencyKey);
      if (commerceActionVersionRef.current !== actionVersion) return;
      const matchesAttempt =
        operation.operation_id === current.operation_id &&
        operation.purchase_origin === current.purchase_origin &&
        (operation.guide_session_id ?? null) === (current.guide_session_id ?? null) &&
        (operation.source_guide_revision ?? null) ===
          (current.source_guide_revision ?? null) &&
        operation.product_id === current.product_id &&
        operation.sku_id === current.sku_id &&
        operation.quantity === current.quantity &&
        (operation.commerce_view_kind !== "SUCCEEDED" ||
          operation.receipt?.idempotency_key === idempotencyKey);
      if (!matchesAttempt) {
        onNotice("对账结果与当前模拟加购不一致，请返回商品重试");
        return;
      }
      setCommerceOperation(operation);
      setCommitStatusUnknown(operation.commerce_view_kind === "COMMIT_STATUS_UNKNOWN");
      onCommerceOperation(operation);
    } catch {
      if (commerceActionVersionRef.current === actionVersion) {
        onNotice("加购结果仍在确认中，请稍后再次查询");
      }
    } finally {
      reconcilePendingRef.current = false;
      if (commerceActionVersionRef.current === actionVersion) {
        setPreviewPending(false);
      }
    }
  }

  if (loadError) {
    return (
      <section className="pdpScreen pdpLoadState" role="region" aria-label="商品详情">
        <button ref={setBackButton} type="button" aria-label="返回内容流" onClick={onBack}>
          ‹
        </button>
        <div role="alert">
          <strong>商品事实暂时无法加载</strong>
          <p>本页没有展示未经校验的价格或库存。</p>
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="pdpScreen pdpLoadState" role="region" aria-label="商品详情">
        <button ref={setBackButton} type="button" aria-label="返回内容流" onClick={onBack}>
          ‹
        </button>
        <div role="status">正在核实商品详情…</div>
      </section>
    );
  }

  if (!selectedSku) {
    return (
      <section className="pdpScreen pdpUnavailableState" role="region" aria-label="商品详情">
        <header className="pdpHeader">
          <button ref={setBackButton} type="button" aria-label="返回内容流" onClick={onBack}>
            <span aria-hidden="true">‹</span>
          </button>
          <span>商品详情</span>
        </header>
        <div className="pdpUnavailableBody">
          <span>{detail.product.brand}</span>
          <h1>{detail.product.name}</h1>
          <p>{detail.product.display_name_zh}</p>
          <div role="status">
            <strong>当前暂无可售规格</strong>
            <small>价格和库存不会在不可交易状态下展示，请稍后再来查看。</small>
          </div>
        </div>
      </section>
    );
  }

  const { product } = detail;
  const factsFresh = hasFreshCatalogFacts(detail);
  return (
    <>
    <section
      className="pdpScreen"
      role="region"
      aria-label="商品详情"
      data-entry-source={entrySource}
      data-product-role={productRole}
    >
      <header className="pdpHeader">
        <button ref={setBackButton} type="button" aria-label="返回内容流" onClick={onBack}>
          <span aria-hidden="true">‹</span>
        </button>
        <span>商品详情</span>
        <div>
          {[
            ["搜索", "搜索功能不在本次概念原型范围内"],
            ["分享", "分享功能不在本次概念原型范围内"],
            ["购物车", "购物车列表不在本次概念原型范围内"],
            ["更多", "更多功能不在本次概念原型范围内"],
          ].map(([label, message]) => (
            <button
              key={label}
              type="button"
              aria-label={label === "购物车" ? `购物车，${cartCount} 件` : label}
              onClick={() => onNotice(message)}
            >
              {label === "搜索" ? "⌕" : label === "分享" ? "↗" : label === "购物车" ? "▱" : "•••"}
            </button>
          ))}
        </div>
      </header>

      <div className="pdpScrollBody">
        <figure className="pdpMedia">
          {/* Synthetic catalog image; the API-provided alt text remains the visible truth source. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedSku.image_src || product.media.src} alt={product.media.alt_zh} />
          <figcaption>合成商品图 · 美国市场概念原型</figcaption>
        </figure>

        <div className="pdpFactsRibbon">
          <span aria-hidden="true">✓</span>
          <p>
            <strong>价格与库存将在加购前复核</strong>
            <small>只使用结构化商品事实，不由 AI 编写</small>
          </p>
        </div>

        {verifiedGuide ? (
          <aside className="pdpAiProvenance" aria-label="已验证的 AI 导购来源">
            <strong>
              AI 建议商品 · {verifiedGuide.productRole === "current" ? "当前款" : "替代款"}
            </strong>
            <small>已重新核对导购会话与第 {verifiedGuide.guideRevision} 版结果</small>
          </aside>
        ) : guideAttributionUnavailable ? (
          <p className="pdpAttributionNotice" role="status">
            导购结果已更新，本次按商品页事实直接复核
          </p>
        ) : null}

        <section className="pdpIdentity">
          <span>{product.brand}</span>
          <h1>{product.name}</h1>
          <p>{product.display_name_zh}</p>
          <small>{product.description_zh}</small>
        </section>

        {factsFresh ? (
          <section className="pdpPrice" aria-label="当前商品价格">
            <strong>{formatUsd(selectedSku.price_usd)}</strong>
            {product.list_price_usd > selectedSku.price_usd ? (
              <del>{formatUsd(product.list_price_usd)}</del>
            ) : null}
            {product.promotion ? <span>{product.promotion}</span> : null}
          </section>
        ) : (
          <p className="pdpExpiredFacts" role="status">
            <strong>商品事实已过期</strong>
            <small>价格和库存已隐藏，重新获取有效快照后才能模拟加购。</small>
          </p>
        )}

        <dl className="pdpFactRows">
          <div>
            <dt>库存</dt>
            <dd>{factsFresh ? `${selectedSku.inventory_units} 件 · 当前可选` : "待重新核实"}</dd>
          </div>
          <div>
            <dt>配送</dt>
            <dd>
              美国 {product.shipping.eta_min_days}–{product.shipping.eta_max_days} 天 · {formatUsd(product.shipping.fee_usd)}
            </dd>
          </div>
          <div>
            <dt>退货</dt>
            <dd>{product.shipping.return_summary_zh}</dd>
          </div>
        </dl>

        <fieldset ref={skuSelectorRef} className="pdpSkuSelector" tabIndex={-1}>
          <legend>选择规格</legend>
          {product.skus.map((sku) => {
            const unavailable = !sku.in_stock || sku.inventory_units < 1;
            return (
              <label key={sku.id} data-unavailable={unavailable || undefined}>
                <input
                  type="radio"
                  name="pdp-sku"
                  value={sku.id}
                  checked={sku.id === selectedSkuId}
                  disabled={unavailable}
                  onChange={() => {
                    selectionVersionRef.current += 1;
                    setSelectedSkuId(sku.id);
                  }}
                />
                <span>{sku.label}</span>
                <small>
                  {!factsFresh
                    ? "待重新核实"
                    : unavailable
                      ? "暂时缺货"
                      : formatUsd(sku.price_usd)}
                </small>
              </label>
            );
          })}
        </fieldset>

        <section className="pdpQuantity" aria-label="购买数量">
          <span>数量</span>
          <div>
            <button
              type="button"
              aria-label="减少数量"
              disabled={quantity <= 1}
              onClick={() => {
                selectionVersionRef.current += 1;
                setQuantity((current) => Math.max(1, current - 1));
              }}
            >
              −
            </button>
            <output aria-label="当前数量">{quantity}</output>
            <button
              type="button"
              aria-label="增加数量"
              disabled={quantity >= 5}
              onClick={() => {
                selectionVersionRef.current += 1;
                setQuantity((current) => Math.min(5, current + 1));
              }}
            >
              +
            </button>
          </div>
        </section>
      </div>

      <footer className="pdpStickyFooter">
        <button type="button" onClick={() => onNotice("店铺页面不在本次概念原型范围内")}>
          <span aria-hidden="true">⌂</span>店铺
        </button>
        <button type="button" onClick={() => onNotice("商家聊天不在本次概念原型范围内")}>
          <span aria-hidden="true">○</span>聊天
        </button>
        <button
          className="pdpPrimaryCta"
          type="button"
          disabled={!factsFresh || previewPending || guideCheckPending}
          onClick={() => void preview()}
        >
          {!factsFresh
            ? "商品事实已过期"
            : guideCheckPending
            ? "正在核对导购来源"
            : previewPending
              ? "正在复核价格与库存"
              : "模拟加入购物车"}
        </button>
      </footer>
    </section>
    <CartConfirmationDrawer
      open={overlay === "cart-confirm"}
      operation={commerceOperation}
      pending={previewPending}
      commitStatusUnknown={commitStatusUnknown}
      onCancel={onCloseOverlay}
      onConfirm={() => void confirm()}
      onAcceptFacts={() => void acceptFacts()}
      onReselect={reselectSku}
      onReconcile={() => void reconcile()}
    />
    <ReceiptDrawer
      open={overlay === "receipt"}
      operation={commerceOperation}
      onReturnProduct={onCloseOverlay}
      onContinueBrowsing={onContinueBrowsing}
    />
    </>
  );
}
