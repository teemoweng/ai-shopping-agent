import type { components } from "@shopping-guide/contracts/src/api";
import Image from "next/image";

type ProductSummary = components["schemas"]["CatalogProductSummary"];

interface ProductAnchorProps {
  product: ProductSummary;
  priceFresh: boolean;
  onOpenProduct: (productId: string) => void;
  onAskAi: () => void;
}

export function ProductAnchor({
  product,
  priceFresh,
  onOpenProduct,
  onAskAi,
}: ProductAnchorProps) {
  return (
    <section className="productAnchor" role="group" aria-label="可购物商品">
      <button
        className="productEntryButton"
        type="button"
        style={{ minHeight: 44 }}
        aria-label={`查看商品 ${product.name}`}
        onClick={() => onOpenProduct(product.id)}
      >
        <span className="productAnchorThumb" aria-hidden="true">
          <Image src={product.image_src} alt="" width={40} height={40} />
        </span>
        <span className="productAnchorCopy">
          <strong className="productAnchorName">{product.name}</strong>
          <small>
            {priceFresh ? `$${product.starting_price_usd.toFixed(2)} 起` : "价格待核实"}
            <span aria-hidden="true"> · </span>
            合成商品
          </small>
        </span>
        <span className="productAnchorChevron" aria-hidden="true">›</span>
      </button>
      <span className="productAnchorDivider" aria-hidden="true" />
      <button
        className="askAiTextButton"
        type="button"
        style={{ minHeight: 44 }}
        aria-label={`问 AI：${product.name}`}
        onClick={onAskAi}
      >
        问 AI
      </button>
    </section>
  );
}
