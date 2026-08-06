import type { components } from "@shopping-guide/contracts/src/api";

import { formatUsd } from "@/lib/formatters";

type CompareResponse = components["schemas"]["CompareResponse"];
type CompareValue = string | number | boolean | null;
type ProductRole = "current" | "alternative";

const comparisonRows = [
  { key: "starting_price_usd", label: "起售价快照" },
  { key: "fragrance_free", label: "无香精" },
  { key: "water_resistance_minutes", label: "防水标注" },
  { key: "finish", label: "妆效" },
  { key: "white_cast_risk", label: "泛白风险" },
] as const;

function formatComparisonValue(
  key: (typeof comparisonRows)[number]["key"],
  value: CompareValue | undefined,
) {
  if (key === "starting_price_usd") {
    return typeof value === "number" ? formatUsd(value) : "暂无数据";
  }
  if (key === "fragrance_free") {
    return typeof value === "boolean" ? (value ? "是" : "否") : "暂无数据";
  }
  if (key === "water_resistance_minutes") {
    if (value === null) {
      return "未标注防水";
    }
    return typeof value === "number" ? `${value} 分钟` : "暂无数据";
  }
  return typeof value === "string" ? value : "暂无数据";
}

export function ComparisonTable({
  comparison,
  productNames = {},
  anchorProductId,
  onOpenProduct,
}: {
  comparison: CompareResponse;
  productNames?: Record<string, string>;
  anchorProductId?: string;
  onOpenProduct?: (productId: string, role: ProductRole) => void;
}) {
  return (
    <section className="comparisonPanel" aria-labelledby="comparison-heading">
      <div className="sectionHeading">
        <span>{comparison.product_ids.length} 款合格候选</span>
        <h2 id="comparison-heading">比较结果</h2>
      </div>
      <div className="comparisonScroller">
        <table aria-label="商品对比">
          <thead>
            <tr>
              <th scope="col">对比维度</th>
              {comparison.product_ids.map((productId) => (
                <th scope="col" key={productId}>
                  {productNames[productId] ?? productId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {comparison.product_ids.map((productId, index) => (
                  <td key={`${row.key}-${productId}`}>
                    {formatComparisonValue(
                      row.key,
                      comparison.rows[row.key]?.[index],
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onOpenProduct ? (
        <div className="comparisonProductActions">
          {comparison.product_ids.map((productId) => {
            const name = productNames[productId] ?? productId;
            return (
              <button
                type="button"
                key={productId}
                aria-label={`查看 ${name}`}
                onClick={() =>
                  onOpenProduct(
                    productId,
                    productId === anchorProductId ? "current" : "alternative",
                  )
                }
              >
                查看 {name}
              </button>
            );
          })}
        </div>
      ) : null}
      <small className="comparisonFreshnessNote">
        价格仅为比较快照，进入商品页后会重新核验库存与交易事实。
      </small>
    </section>
  );
}
