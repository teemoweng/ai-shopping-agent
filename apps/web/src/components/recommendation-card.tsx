"use client";

import type { components } from "@shopping-guide/contracts/src/api";

type Recommendation = components["schemas"]["RecommendationCard"];
type EvidenceReference = components["schemas"]["EvidenceReference"];
type EvidenceStatus = components["schemas"]["EvidenceStatus"];
type Verdict = components["schemas"]["Verdict"];
type ProductRole = "current" | "alternative";

const verdictLabels = {
  SUITABLE: "适合",
  CONDITIONAL: "有条件适合",
  NOT_RECOMMENDED: "不建议",
  INSUFFICIENT_EVIDENCE: "信息不足",
} satisfies Record<Verdict, string>;

const evidenceLabels = {
  SUPPORTED: "有公开依据",
  CONFLICTING: "与来源冲突",
  INSUFFICIENT_EVIDENCE: "证据不足",
  SUBJECTIVE_MIXED: "主观体验分歧",
} satisfies Record<EvidenceStatus, string>;

function safePublicUrl(evidence: EvidenceReference) {
  if (evidence.synthetic || evidence.source_kind !== "public_rule") {
    return null;
  }
  try {
    const url = new URL(evidence.url);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function RecommendationCard({
  recommendation,
  index,
  role,
  evidence,
  comparisonEnabled,
  disabled = false,
  selectedForCompare,
  compareDisabled = false,
  onCompareChange,
  onOpenProduct,
}: {
  recommendation: Recommendation;
  index: number;
  role: ProductRole;
  evidence: EvidenceReference[];
  comparisonEnabled: boolean;
  disabled?: boolean;
  selectedForCompare: boolean;
  compareDisabled?: boolean;
  onCompareChange: (productId: string, selected: boolean) => void;
  onOpenProduct?: (productId: string, role: ProductRole) => void;
}) {
  return (
    <article
      className="recommendationCard"
      aria-label={`${recommendation.name} 商品建议`}
    >
      <div className="recommendationTopline">
        <span className={index === 0 ? "closestFit" : "candidateRole"}>
          {role === "current"
            ? "视频同款"
            : index === 0
              ? "优先建议"
              : "合格替代"}
        </span>
        <span className="verdictBadge" data-verdict={recommendation.verdict}>
          {verdictLabels[recommendation.verdict]}
        </span>
      </div>

      <div className="recommendationIdentity">
        <span>{recommendation.brand}</span>
        <h3>{recommendation.name}</h3>
      </div>

      <div className="decisionColumns">
        <section aria-label={`${recommendation.name} 的适配原因`}>
          <h4>为什么适合</h4>
          <ul>
            {recommendation.fit_reasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        <section aria-label={`${recommendation.name} 的取舍`}>
          <h4>需要接受的取舍</h4>
          <ul>
            {recommendation.tradeoffs.slice(0, 3).map((tradeoff) => (
              <li key={tradeoff}>{tradeoff}</li>
            ))}
          </ul>
        </section>
      </div>

      {evidence.length > 0 ? (
        <div className="recommendationEvidence">
          {evidence.map((item) => {
            const sourceUrl = safePublicUrl(item);
            return (
              <details key={item.evidence_id} data-status={item.status}>
                <summary>
                  <span>{evidenceLabels[item.status]}</span>
                  {item.title}
                </summary>
                <p>{item.summary}</p>
                {item.synthetic ? (
                  <small>合成评测证据 · 不是外部用户研究</small>
                ) : sourceUrl ? (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.title}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                ) : (
                  <small>来源地址未通过安全校验，本页不提供跳转</small>
                )}
              </details>
            );
          })}
        </div>
      ) : (
        <p className="recommendationEvidenceEmpty">此候选暂无可引用证据。</p>
      )}

      <div className="recommendationControls">
        {comparisonEnabled ? (
          <label className="compareControl">
            <input
              type="checkbox"
              name="comparison-products"
              value={recommendation.product_id}
              checked={selectedForCompare}
              disabled={disabled || compareDisabled}
              onChange={(event) => {
                if (disabled) {
                  return;
                }
                onCompareChange(
                  recommendation.product_id,
                  event.target.checked,
                );
              }}
              aria-label={`比较 ${recommendation.name}`}
            />
            加入比较
          </label>
        ) : null}
        {onOpenProduct ? (
          <button
            type="button"
            className="openProductButton"
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onOpenProduct(recommendation.product_id, role);
              }
            }}
          >
            查看商品
          </button>
        ) : null}
      </div>
    </article>
  );
}
