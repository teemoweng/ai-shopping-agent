import Image from "next/image";

import { ProductAnchor } from "./product-anchor";

export function ShortVideoFeed({ onAskAi }: { onAskAi: () => void }) {
  return (
    <main className="interviewStage">
      <section
        className="phoneFrame"
        aria-label="Short-video shopping concept"
        data-content-context="morning-routine-uv-001"
      >
        <Image
          className="poster"
          src="/demo/sunscreen-poster.svg"
          alt="Abstract synthetic sunscreen routine poster"
          fill
          priority
          sizes="(max-width: 520px) 100vw, 430px"
        />
        <div className="posterShade" aria-hidden="true" />

        <header className="prototypeBadge">
          Concept prototype · Synthetic products
        </header>

        <nav className="feedTabs" aria-label="Content feed">
          <strong aria-current="page">For You</strong>
          <span>Following</span>
        </nav>

        <aside className="actionRail" aria-label="Content actions">
          <button type="button" aria-label="Like">
            <span className="railHeart" aria-hidden="true">♡</span>
            <small>2.4K</small>
          </button>
          <button type="button" aria-label="Comments">
            <span className="railComment" aria-hidden="true" />
            <small>28</small>
          </button>
          <button type="button" aria-label="Save">
            <span className="railSave" aria-hidden="true" />
            <small>Save</small>
          </button>
        </aside>

        <div className="creatorCopy">
          <span className="contextStamp">UV field note · synthetic</span>
          <strong>@routine.notes</strong>
          <p>A lightweight SPF step for a humid commute</p>
        </div>

        <ProductAnchor onAskAi={onAskAi} />
      </section>
    </main>
  );
}
