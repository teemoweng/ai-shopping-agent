import type { SVGProps } from "react";

export type DemoIconName =
  | "back"
  | "bag"
  | "battery"
  | "bookmark"
  | "cart"
  | "chat"
  | "check"
  | "comment"
  | "heart"
  | "home"
  | "inbox"
  | "more"
  | "mute"
  | "plus"
  | "search"
  | "share"
  | "signal"
  | "store"
  | "user"
  | "volume"
  | "wifi";

interface DemoIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: DemoIconName;
  filled?: boolean;
}

export function DemoIcon({ name, filled = false, ...props }: DemoIconProps) {
  const common = {
    fill: filled ? "currentColor" : "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
  };

  return (
    <svg
      {...props}
      data-demo-icon={name}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g {...common}>
        {name === "search" ? (
          <><circle cx="10.7" cy="10.7" r="6.6" /><path d="m15.7 15.7 4.2 4.2" /></>
        ) : name === "heart" ? (
          <path d="M20.3 5.8c-2-2.1-5.3-2.1-7.3 0L12 6.9l-1-1.1a5 5 0 0 0-7.3 0c-2 2.1-2 5.5 0 7.6L12 22l8.3-8.6c2-2.1 2-5.5 0-7.6Z" />
        ) : name === "comment" ? (
          <path d="M20.5 11.2a8.2 8.2 0 0 1-8.6 8.1 9 9 0 0 1-3.2-.7L4 20l1.3-4.1a7.7 7.7 0 0 1-1.8-4.9 8.2 8.2 0 0 1 8.6-8.1 8.2 8.2 0 0 1 8.4 8.3Z" />
        ) : name === "bookmark" ? (
          <path d="M6.2 3.2h11.6v17.6L12 17.2l-5.8 3.6V3.2Z" />
        ) : name === "share" ? (
          <><path d="M13.6 5.3 17.9 9l-4.3 3.8" /><path d="M17.7 9H11a6 6 0 0 0-6 6v3.7" /></>
        ) : name === "volume" || name === "mute" ? (
          <>
            <path d="M4 9.2h3.6L12 5.7v12.6l-4.4-3.5H4V9.2Z" />
            {name === "volume" ? <><path d="M15 9a4.2 4.2 0 0 1 0 6" /><path d="M17.6 6.7a7.4 7.4 0 0 1 0 10.6" /></> : <><path d="m15.2 9.2 5.1 5.1" /><path d="m20.3 9.2-5.1 5.1" /></>}
          </>
        ) : name === "home" ? (
          <><path d="m3.3 11.1 8.7-7 8.7 7" /><path d="M5.7 9.4v10.1h12.6V9.4M9.6 19.5v-5.8h4.8v5.8" /></>
        ) : name === "bag" ? (
          <><path d="M4.5 8h15l-1 12h-13l-1-12Z" /><path d="M8.5 9V6.7a3.5 3.5 0 0 1 7 0V9" /></>
        ) : name === "plus" ? (
          <><path d="M12 5v14M5 12h14" /></>
        ) : name === "inbox" ? (
          <><path d="M4 5h16v13H4V5Z" /><path d="m4 7 8 6 8-6" /></>
        ) : name === "user" ? (
          <><circle cx="12" cy="8" r="3.6" /><path d="M5.2 20a6.8 6.8 0 0 1 13.6 0" /></>
        ) : name === "back" ? (
          <><path d="m14.7 5.1-6.9 6.9 6.9 6.9" /></>
        ) : name === "cart" ? (
          <><path d="M3.5 5h2l1.8 9.2h9.8l2-6.4H6.2" /><circle cx="9" cy="18.5" r="1" /><circle cx="16.2" cy="18.5" r="1" /></>
        ) : name === "more" ? (
          <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>
        ) : name === "store" ? (
          <><path d="M4 9h16l-1.5-5h-13L4 9Z" /><path d="M5.5 9v10h13V9M9.5 19v-5h5v5" /><path d="M4 9a3 3 0 0 0 4 2.8A3 3 0 0 0 12 12a3 3 0 0 0 4-.2A3 3 0 0 0 20 9" /></>
        ) : name === "chat" ? (
          <><path d="M4 5h16v11H9l-5 3V5Z" /><path d="M8 10h8M8 13h5" /></>
        ) : name === "check" ? (
          <path d="m5 12.5 4.2 4.2L19 7" />
        ) : name === "signal" ? (
          <><path d="M4 18v-2M8 18v-5M12 18V9M16 18V6" /></>
        ) : name === "wifi" ? (
          <><path d="M4 10.2a11.6 11.6 0 0 1 16 0M7.2 13.4a7 7 0 0 1 9.6 0M10.3 16.5a2.5 2.5 0 0 1 3.4 0" /><circle cx="12" cy="19" r=".7" fill="currentColor" stroke="none" /></>
        ) : name === "battery" ? (
          <><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10v4" /><path d="M6 10h8v4H6z" fill="currentColor" stroke="none" /></>
        ) : null}
      </g>
    </svg>
  );
}
