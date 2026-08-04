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

        <aside className="actionRail" aria-label="Synthetic engagement">
          <div
            className="engagementMetric"
            role="group"
            aria-label="2.4K likes · synthetic metric"
          >
            <span className="railHeart" aria-hidden="true">♡</span>
            <small>
              <span className="metricValue">2.4K</span>
              <span className="metricName">Likes</span>
            </small>
          </div>
          <div
            className="engagementMetric"
            role="group"
            aria-label="28 comments · synthetic metric"
          >
            <span className="railComment" aria-hidden="true" />
            <small>
              <span className="metricValue">28</span>
              <span className="metricName">Comments</span>
            </small>
          </div>
          <div
            className="engagementMetric"
            role="group"
            aria-label="Saves · synthetic metric"
          >
            <span className="railSave" aria-hidden="true" />
            <small className="metricName">Saves</small>
          </div>
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
