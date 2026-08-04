import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ShortVideoFeed } from "@/components/short-video-feed";
import Home from "@/app/page";

afterEach(cleanup);

it("shows prototype disclosure, content context, product anchor, and Ask AI", () => {
  const onAskAi = vi.fn();

  render(<ShortVideoFeed onAskAi={onAskAi} />);

  expect(screen.getByText("Concept prototype · Synthetic products")).toBeVisible();
  expect(screen.getByText("Seoul Shade Daily Fluid")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Ask AI about this product" }),
  );
  expect(onAskAi).toHaveBeenCalledOnce();
});

it("opens the temporary accessible guide only after Ask AI", () => {
  render(<Home />);

  expect(
    screen.queryByRole("dialog", { name: "AI shopping guide" }),
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Ask AI about this product" }),
  );

  expect(
    screen.getByRole("dialog", { name: "AI shopping guide" }),
  ).toHaveTextContent("Guide opening…");
});
