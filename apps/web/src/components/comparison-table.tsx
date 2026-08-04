import type { components } from "@shopping-guide/contracts/src/api";

import { formatUsd } from "@/lib/formatters";

type CompareResponse = components["schemas"]["CompareResponse"];
type CompareValue = string | number | boolean | null;

const comparisonRows = [
  { key: "starting_price_usd", label: "Starting price" },
  { key: "fragrance_free", label: "Fragrance free" },
  { key: "water_resistance_minutes", label: "Water resistance" },
  { key: "finish", label: "Finish" },
  { key: "white_cast_risk", label: "White-cast risk" },
] as const;

function formatComparisonValue(
  key: (typeof comparisonRows)[number]["key"],
  value: CompareValue | undefined,
) {
  if (key === "starting_price_usd") {
    return typeof value === "number" ? formatUsd(value) : "Not available";
  }
  if (key === "fragrance_free") {
    return typeof value === "boolean" ? (value ? "Yes" : "No") : "Not available";
  }
  if (key === "water_resistance_minutes") {
    if (value === null) {
      return "Not labeled water resistant";
    }
    return typeof value === "number" ? `${value} min` : "Not available";
  }
  return typeof value === "string" ? value : "Not available";
}

export function ComparisonTable({
  comparison,
}: {
  comparison: CompareResponse;
}) {
  return (
    <section className="comparisonPanel" aria-labelledby="comparison-heading">
      <div className="sectionHeading">
        <span>{comparison.product_ids.length} selected products</span>
        <h2 id="comparison-heading">Product comparison</h2>
      </div>
      <div className="comparisonScroller">
        <table aria-label="Product comparison">
          <thead>
            <tr>
              <th scope="col">Product fact</th>
              {comparison.product_ids.map((productId) => (
                <th scope="col" key={productId}>
                  {productId}
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
                    {formatComparisonValue(row.key, comparison.rows[row.key]?.[index])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
