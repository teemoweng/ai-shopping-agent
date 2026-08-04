"use client";

import type { components } from "@shopping-guide/contracts/src/api";

import { formatUsd } from "@/lib/formatters";

type Recommendation = components["schemas"]["RecommendationCard"];
type Verdict = components["schemas"]["Verdict"];

const verdictLabels = {
  SUITABLE: "Suitable",
  CONDITIONAL: "Conditional fit",
  NOT_RECOMMENDED: "Not recommended",
  INSUFFICIENT_EVIDENCE: "Evidence limited",
} satisfies Record<Verdict, string>;

export function RecommendationCard({
  recommendation,
  index,
  selectedSkuId,
  onSelectedSkuChange,
  selectedForCompare,
  compareDisabled = false,
  onCompareChange,
}: {
  recommendation: Recommendation;
  index: number;
  selectedSkuId: string | null;
  onSelectedSkuChange: (skuId: string | null) => void;
  selectedForCompare: boolean;
  compareDisabled?: boolean;
  onCompareChange: (productId: string, selected: boolean) => void;
}) {
  const selectedSkuForCard = recommendation.eligible_sku_ids.includes(
    selectedSkuId ?? "",
  )
    ? selectedSkuId
    : null;
  const hasEligibleSku = recommendation.eligible_sku_ids.length > 0;
  const evidenceLabel = `${recommendation.evidence_ids.length} evidence ${
    recommendation.evidence_ids.length === 1 ? "source" : "sources"
  }`;

  return (
    <article className="recommendationCard">
      <div className="recommendationTopline">
        {index === 0 ? <span className="closestFit">Closest fit</span> : <span />}
        <span
          className="verdictBadge"
          data-verdict={recommendation.verdict}
        >
          {verdictLabels[recommendation.verdict]}
        </span>
      </div>

      <div className="recommendationIdentity">
        <span>{recommendation.brand}</span>
        <h3>{recommendation.name}</h3>
        <strong>{formatUsd(recommendation.starting_price_usd)}</strong>
      </div>

      <div className="decisionColumns">
        <section aria-label={`Why ${recommendation.name} fits`}>
          <h4>Why it fits</h4>
          <ul>
            {recommendation.fit_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
        <section aria-label={`Tradeoffs for ${recommendation.name}`}>
          <h4>Tradeoffs</h4>
          <ul>
            {recommendation.tradeoffs.map((tradeoff) => (
              <li key={tradeoff}>{tradeoff}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="recommendationControls">
        <label>
          <span>Eligible size</span>
          <select
            aria-label={`Size for ${recommendation.name}`}
            value={selectedSkuForCard ?? ""}
            disabled={!hasEligibleSku}
            onChange={(event) =>
              onSelectedSkuChange(event.target.value || null)
            }
          >
            {!hasEligibleSku ? (
              <option value="">No eligible SKU</option>
            ) : selectedSkuForCard === null ? (
              <option value="">Select a size</option>
            ) : null}
            {recommendation.eligible_sku_ids.map((skuId) => (
              <option value={skuId} key={skuId}>
                {skuId}
              </option>
            ))}
          </select>
        </label>
        <label className="compareControl">
          <input
            type="checkbox"
            checked={selectedForCompare}
            disabled={compareDisabled}
            onChange={(event) =>
              onCompareChange(recommendation.product_id, event.target.checked)
            }
            aria-label={`Compare ${recommendation.name}`}
          />
          Compare
        </label>
        <span className="evidenceCount">{evidenceLabel}</span>
      </div>
    </article>
  );
}
