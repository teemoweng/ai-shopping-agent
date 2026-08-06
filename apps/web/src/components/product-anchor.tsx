import type { components } from "@shopping-guide/contracts/src/api";
import Image from "next/image";
import type { Ref } from "react";

type ProductSummary = components["schemas"]["CatalogProductSummary"];

interface ProductAnchorProps {
  product: ProductSummary;
  startingPriceUsd: number | null;
  entryButtonRef?: Ref<HTMLButtonElement>;
  onOpenProduct: (productId: string) => void;
  onAskAi: () => void;
}

export function ProductAnchor({
  product,
  startingPriceUsd,
  entryButtonRef,
  onOpenProduct,
  onAskAi,
}: ProductAnchorProps) {
  return (
    <section className="productAnchor" role="group" aria-label="可购物商品">
      <button
        ref={entryButtonRef}
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
            {startingPriceUsd === null
              ? "价格待核实"
              : `$${startingPriceUsd.toFixed(2)} 起`}
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
