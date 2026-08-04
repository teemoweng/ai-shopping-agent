"use client";

import { useState } from "react";

import { ShortVideoFeed } from "@/components/short-video-feed";

export default function Home() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <ShortVideoFeed onAskAi={() => setGuideOpen(true)} />
      {guideOpen ? (
        <div
          className="guideLaunchDialog"
          role="dialog"
          aria-label="AI shopping guide"
          aria-live="polite"
        >
          <span className="guideLaunchSignal" aria-hidden="true" />
          Guide opening…
        </div>
      ) : null}
    </>
  );
}
