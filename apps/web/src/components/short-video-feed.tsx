"use client";

import type { components } from "@shopping-guide/contracts/src/api";
import Image from "next/image";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type UIEvent,
} from "react";

import {
  captureAndPauseVideo,
  type VideoSnapshot,
} from "@/lib/demo-navigation";

import { ProductAnchor } from "./product-anchor";
import { DemoIcon, type DemoIconName } from "./demo-icon";

type FeedItem = components["schemas"]["CatalogFeedItemResponse"];

interface PlaybackIntent {
  generation: number;
  shouldPlay: boolean;
  video: HTMLVideoElement;
}

type PlaybackIntents = Record<string, PlaybackIntent | undefined>;

function setPlaybackIntent(
  intents: PlaybackIntents,
  itemId: string,
  video: HTMLVideoElement,
  shouldPlay: boolean,
): PlaybackIntent {
  const intent = {
    generation: (intents[itemId]?.generation ?? 0) + 1,
    shouldPlay,
    video,
  };
  intents[itemId] = intent;
  return intent;
}

function safelyPauseVideo(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {
    // A media failure must not interrupt Feed navigation or restoration.
  }
}

function pauseVideoPlayback(
  intents: PlaybackIntents,
  itemId: string,
  video: HTMLVideoElement,
) {
  setPlaybackIntent(intents, itemId, video, false);
  safelyPauseVideo(video);
}

function enforceSettledPlaybackIntent(
  intents: PlaybackIntents,
  itemId: string,
  video: HTMLVideoElement,
  generation: number,
) {
  const current = intents[itemId];
  const requestStillOwnsPlayback =
    current?.generation === generation &&
    current.shouldPlay &&
    current.video === video;
  const newerPlayOwnsSameVideo =
    current?.generation !== generation &&
    current?.shouldPlay === true &&
    current.video === video;
  if (!requestStillOwnsPlayback && !newerPlayOwnsSameVideo) {
    safelyPauseVideo(video);
  }
}

function requestVideoPlayback(
  intents: PlaybackIntents,
  itemId: string,
  video: HTMLVideoElement,
): Promise<void> {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    pauseVideoPlayback(intents, itemId, video);
    return Promise.resolve();
  }
  const { generation } = setPlaybackIntent(intents, itemId, video, true);
  let playResult: Promise<void> | undefined;
  try {
    playResult = video.play();
  } catch {
    return Promise.resolve();
  }
  const enforceLatestIntent = () =>
    enforceSettledPlaybackIntent(intents, itemId, video, generation);
  return Promise.resolve(playResult).then(enforceLatestIntent, enforceLatestIntent);
}

function restoreVideoPlayback(
  intents: PlaybackIntents,
  itemId: string,
  video: HTMLVideoElement,
  snapshot: VideoSnapshot,
): Promise<void> {
  try {
    video.currentTime = Number.isFinite(snapshot.currentTime)
      ? Math.max(0, snapshot.currentTime)
      : 0;
  } catch {
    // Some browsers reject seeking until metadata is available.
  }
  video.muted = snapshot.muted;
  if (snapshot.paused) {
    pauseVideoPlayback(intents, itemId, video);
    return Promise.resolve();
  }
  return requestVideoPlayback(intents, itemId, video);
}

export interface ShortVideoFeedHandle {
  capture(itemId: string): VideoSnapshot | null;
  restore(itemId: string, snapshot: VideoSnapshot): Promise<void>;
  focusAskAi(itemId: string): void;
  focusProduct(itemId: string): void;
}

interface ShortVideoFeedProps {
  items: FeedItem[];
  feedTabs: string[];
  bottomNavVariant: string;
  activeIndex: number;
  freshStartingPriceByProductId?: Record<string, number | null>;
  initialVideoRestore?: {
    itemId: string;
    snapshot: VideoSnapshot;
  } | null;
  onFeedIndexChange: (index: number) => void;
  onOpenProduct: (productId: string, item: FeedItem) => void;
  onAskAi: (item: FeedItem) => void;
  onNotice: (message: string) => void;
}

interface BottomNavigationItem {
  label: string;
  icon: DemoIconName;
}

const bottomNavigationByVariant: Record<
  string,
  readonly BottomNavigationItem[]
> = {
  "content-commerce-v1": [
    { label: "首页", icon: "home" },
    { label: "商城", icon: "bag" },
    { label: "发布", icon: "plus" },
    { label: "收件箱", icon: "inbox" },
    { label: "主页", icon: "user" },
  ],
};

function bottomNavigationForVariant(
  variant: string,
): readonly BottomNavigationItem[] {
  return (
    bottomNavigationByVariant[variant] ??
    bottomNavigationByVariant["content-commerce-v1"]
  );
}

const boundaryMessage = (feature: string) =>
  `${feature}未接入本次概念原型；当前只演示内容导购路径`;

function compactNumber(value: number): string {
  if (value >= 10_000) {
    const count = Math.round((value / 10_000) * 10) / 10;
    return `${count.toString().replace(/\.0$/, "")}万`;
  }
  if (value >= 1_000) {
    const count = Math.round((value / 1_000) * 10) / 10;
    return `${count.toString().replace(/\.0$/, "")}k`;
  }
  return String(value);
}

export const ShortVideoFeed = forwardRef<
  ShortVideoFeedHandle,
  ShortVideoFeedProps
>(function ShortVideoFeed(
  {
    items,
    feedTabs,
    bottomNavVariant,
    activeIndex,
    freshStartingPriceByProductId = {},
    initialVideoRestore = null,
    onFeedIndexChange,
    onOpenProduct,
    onAskAi,
    onNotice,
  },
  ref,
) {
  const videoElements = useRef<Record<string, HTMLVideoElement | null>>({});
  const productEntryElements = useRef<
    Record<string, HTMLButtonElement | null>
  >({});
  const playbackIntentsRef = useRef<PlaybackIntents>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const initialVideoRestoreRef = useRef(initialVideoRestore);
  const [mutedById, setMutedById] = useState<Record<string, boolean>>(() =>
    initialVideoRestore
      ? {
          [initialVideoRestore.itemId]: initialVideoRestore.snapshot.muted,
        }
      : {},
  );
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);
  const bottomNavigation = bottomNavigationForVariant(bottomNavVariant);
  const commentTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeCommentsRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!commentItem) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeCommentsRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      commentTriggerRef.current?.focus();
    };
  }, [commentItem]);

  useEffect(() => {
    if (!initialVideoRestore) {
      initialVideoRestoreRef.current = null;
    }
  }, [initialVideoRestore]);

  useEffect(() => {
    const pendingRestore = initialVideoRestoreRef.current;
    const intents = playbackIntentsRef.current;
    const videosAtSetup = items.map((item, index) => ({
      index,
      item,
      video: videoElements.current[item.id],
    }));
    for (const { index, item, video } of videosAtSetup) {
      if (!video) {
        continue;
      }
      if (index === activeIndex && pendingRestore?.itemId === item.id) {
        void restoreVideoPlayback(
          intents,
          item.id,
          video,
          pendingRestore.snapshot,
        );
        continue;
      }
      if (index !== activeIndex) {
        pauseVideoPlayback(intents, item.id, video);
        continue;
      }
      void requestVideoPlayback(intents, item.id, video);
    }
    return () => {
      for (const { item, video } of videosAtSetup) {
        if (video) {
          pauseVideoPlayback(intents, item.id, video);
        }
      }
    };
  }, [activeIndex, items]);

  useImperativeHandle(ref, () => ({
    capture(itemId) {
      const video = videoElements.current[itemId];
      if (!video) {
        return null;
      }
      setPlaybackIntent(playbackIntentsRef.current, itemId, video, false);
      return captureAndPauseVideo(video);
    },
    async restore(itemId, snapshot) {
      const video = videoElements.current[itemId];
      if (!video) {
        return;
      }
      setMutedById((current) => ({ ...current, [itemId]: snapshot.muted }));
      await restoreVideoPlayback(
        playbackIntentsRef.current,
        itemId,
        video,
        snapshot,
      );
    },
    focusAskAi(itemId) {
      productEntryElements.current[itemId]?.parentElement
        ?.querySelector<HTMLButtonElement>(".askAiTextButton")
        ?.focus();
    },
    focusProduct(itemId) {
      productEntryElements.current[itemId]?.focus();
    },
  }));

  function toggleSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    itemId: string,
  ) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function toggleSound(item: FeedItem) {
    const video = videoElements.current[item.id];
    const nextMuted = !(mutedById[item.id] ?? true);
    if (video) {
      video.muted = nextMuted;
    }
    setMutedById((current) => ({ ...current, [item.id]: nextMuted }));
  }

  async function shareItem(item: FeedItem) {
    const url = `${window.location.origin}${window.location.pathname}#${item.id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: item.creator_display_name,
          text: item.caption_zh,
          url,
        });
        onNotice("已打开系统分享");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        onNotice("演示链接已复制");
        return;
      }
      onNotice(boundaryMessage("分享"));
    } catch {
      onNotice("分享未完成，内容仍可继续浏览");
    }
  }

  function handleFeedScroll(event: UIEvent<HTMLDivElement>) {
    const container = event.currentTarget;
    if (container.clientHeight <= 0) {
      return;
    }
    const nextIndex = Math.min(
      items.length - 1,
      Math.max(0, Math.round(container.scrollTop / container.clientHeight)),
    );
    if (nextIndex !== activeIndex) {
      onFeedIndexChange(nextIndex);
    }
  }

  return (
    <div className="feedSurface" data-bottom-nav-variant={bottomNavVariant}>
      <header className="feedChrome">
        <div className="feedStatusBar" aria-hidden="true">
          <time dateTime="09:41">9:41</time>
          <span>
            <DemoIcon name="signal" />
            <DemoIcon name="wifi" />
            <DemoIcon name="battery" />
          </span>
        </div>
        <nav className="feedTabs" aria-label="内容频道">
          {feedTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={tab === "推荐" ? "page" : undefined}
              onClick={() => onNotice(boundaryMessage(tab))}
            >
              {tab}
            </button>
          ))}
        </nav>
        <button
          className="feedSearchButton"
          type="button"
          aria-label="搜索"
          onClick={() => onNotice(boundaryMessage("搜索"))}
        >
          <DemoIcon name="search" />
        </button>
      </header>

      <div
        className="feedScroller"
        data-testid="feed-scroll"
        onScroll={handleFeedScroll}
      >
        {items.map((item, index) => {
          const liked = likedIds.has(item.id);
          const saved = savedIds.has(item.id);
          const muted = mutedById[item.id] ?? true;
          const mediaFailed = failedMediaIds.has(item.id);
          const shoppable =
            item.commerce_status === "available" && item.anchor_product !== null;

          return (
            <article
              className="feedItem"
              key={item.id}
              data-testid="feed-item"
              data-feed-item-id={item.id}
              data-commerce-status={item.commerce_status}
              aria-label={`${item.creator_display_name} 的短视频`}
            >
              <video
                ref={(video) => {
                  videoElements.current[item.id] = video;
                }}
                className="feedVideo"
                data-testid="feed-video"
                aria-label={item.media.alt_zh}
                src={item.media.src}
                poster={item.media.poster_src ?? undefined}
                playsInline
                muted={muted}
                loop
                preload="metadata"
                onError={() => {
                  setFailedMediaIds((current) => new Set(current).add(item.id));
                  onNotice("视频暂时无法播放，已显示同源封面");
                }}
              />
              {mediaFailed && item.media.poster_src ? (
                <Image
                  className="feedPosterFallback"
                  src={item.media.poster_src}
                  alt={item.media.alt_zh}
                  fill
                  unoptimized
                  sizes="(max-width: 520px) 100vw, 390px"
                  priority={index === 0}
                />
              ) : null}
              <div className="feedGradient" aria-hidden="true" />

              <aside
                className="actionRail"
                aria-label={`${item.creator_display_name} 的视频互动`}
              >
                <button
                  className="creatorFollowButton"
                  type="button"
                  aria-label={`关注 ${item.creator_display_name}`}
                  onClick={() => onNotice(boundaryMessage("关注创作者"))}
                >
                  <span aria-hidden="true">
                    {item.creator_display_name.slice(0, 1)}
                  </span>
                  <b aria-hidden="true"><DemoIcon name="plus" /></b>
                </button>
                <button
                  className="railAction"
                  type="button"
                  aria-label={liked ? "取消点赞" : "点赞"}
                  aria-pressed={liked}
                  onClick={() => toggleSet(setLikedIds, item.id)}
                >
                  <span className="railIcon" aria-hidden="true">
                    <DemoIcon name="heart" filled={liked} />
                  </span>
                  <small>
                    {compactNumber(item.engagement.likes + (liked ? 1 : 0))}
                  </small>
                </button>
                <button
                  className="railAction"
                  type="button"
                  aria-label="查看评论"
                  onClick={(event) => {
                    commentTriggerRef.current = event.currentTarget;
                    setCommentItem(item);
                  }}
                >
                  <span className="railComment" aria-hidden="true">
                    <DemoIcon name="comment" />
                  </span>
                  <small>{compactNumber(item.engagement.comments)}</small>
                </button>
                <button
                  className="railAction"
                  type="button"
                  aria-label={saved ? "取消收藏" : "收藏"}
                  aria-pressed={saved}
                  onClick={() => toggleSet(setSavedIds, item.id)}
                >
                  <span className="railSave" aria-hidden="true">
                    <DemoIcon name="bookmark" filled={saved} />
                  </span>
                  <small>
                    {compactNumber(
                      item.engagement.favorites + (saved ? 1 : 0),
                    )}
                  </small>
                </button>
                <button
                  className="railAction"
                  type="button"
                  aria-label="分享"
                  onClick={() => void shareItem(item)}
                >
                  <span className="railShare" aria-hidden="true">
                    <DemoIcon name="share" />
                  </span>
                  <small>{compactNumber(item.engagement.shares)}</small>
                </button>
                <button
                  className="railAction"
                  type="button"
                  aria-label={muted ? "打开声音" : "静音"}
                  onClick={() => toggleSound(item)}
                >
                  <span className="railSound" aria-hidden="true">
                    <DemoIcon name={muted ? "mute" : "volume"} />
                  </span>
                </button>
              </aside>

              <div className="feedLowerOverlay">
                {shoppable ? (
                  <ProductAnchor
                    product={item.anchor_product!}
                    startingPriceUsd={
                      freshStartingPriceByProductId[item.anchor_product!.id] ??
                      null
                    }
                    entryButtonRef={(button) => {
                      productEntryElements.current[item.id] = button;
                    }}
                    onOpenProduct={(productId) => onOpenProduct(productId, item)}
                    onAskAi={() => onAskAi(item)}
                  />
                ) : null}
                <div className="creatorCopy">
                  <strong>{item.creator_handle}</strong>
                  <p>{item.caption_zh}</p>
                  <small>合成创作者与互动数据</small>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <nav className="bottomNavigation" aria-label="底部导航">
        {bottomNavigation.map((item) => (
          <button
            key={item.label}
            className={item.label === "首页" ? "isActive" : undefined}
            type="button"
            aria-label={item.label}
            aria-current={item.label === "首页" ? "page" : undefined}
            onClick={() => onNotice(boundaryMessage(item.label))}
          >
            <span aria-hidden="true">
              <DemoIcon name={item.icon} />
            </span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>

      {commentItem ? (
        <div className="commentsBackdrop">
          <section
            className="commentsDrawer"
            role="dialog"
            aria-modal="true"
            aria-label="合成评论"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setCommentItem(null);
              } else if (event.key === "Tab") {
                event.preventDefault();
                closeCommentsRef.current?.focus();
              }
            }}
          >
            <header>
              <div>
                <strong>
                  {compactNumber(commentItem.engagement.comments)} 条评论
                </strong>
                <small>只读演示</small>
              </div>
              <button
                ref={closeCommentsRef}
                type="button"
                aria-label="关闭评论"
                onClick={() => setCommentItem(null)}
              >
                ×
              </button>
            </header>
            <div className="syntheticComments">
              <article>
                <strong>合成用户 · 通勤党</strong>
                <p>想知道深肤色妆前会不会泛白。</p>
              </article>
              <article>
                <strong>合成用户 · 户外党</strong>
                <p>日常使用感和防水需求确实要分开判断。</p>
              </article>
            </div>
            <p className="commentsDisclosure">
              所有评论均为合成内容，未连接真实平台数据。
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
});
