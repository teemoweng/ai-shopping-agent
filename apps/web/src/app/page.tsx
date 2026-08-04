"use client";

import { useState } from "react";

import { GuideSheet } from "@/components/guide-sheet";
import { ShortVideoFeed } from "@/components/short-video-feed";

export default function Home() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <ShortVideoFeed onAskAi={() => setGuideOpen(true)} />
      <GuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
