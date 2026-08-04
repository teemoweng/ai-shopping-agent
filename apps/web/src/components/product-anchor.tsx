export function ProductAnchor({ onAskAi }: { onAskAi: () => void }) {
  return (
    <section className="productAnchor" aria-label="Featured synthetic product">
      <div className="productAnchorCopy">
        <span>Mirae Lab</span>
        <strong>Seoul Shade Daily Fluid</strong>
        <small>From $14.00 · Synthetic</small>
      </div>
      <button
        className="askAiButton"
        type="button"
        onClick={onAskAi}
        aria-label="Ask AI about this product"
      >
        Ask AI
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  );
}
