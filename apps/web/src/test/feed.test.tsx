import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

it("presents synthetic engagement as metrics rather than dead controls", () => {
  render(<ShortVideoFeed onAskAi={vi.fn()} />);

  const engagement = screen.getByRole("complementary", {
    name: "Synthetic engagement",
  });

  expect(within(engagement).queryAllByRole("button")).toHaveLength(0);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(
    within(engagement).getByRole("group", {
      name: "2.4K likes · synthetic metric",
    }),
  ).toBeVisible();
  expect(
    within(engagement).getByRole("group", {
      name: "28 comments · synthetic metric",
    }),
  ).toBeVisible();
  expect(
    within(engagement).getByRole("group", {
      name: "Saves · synthetic metric",
    }),
  ).toBeVisible();
  expect(within(engagement).getByText("2.4K")).toBeVisible();
  expect(within(engagement).getByText("Likes")).toBeVisible();
  expect(within(engagement).getByText("28")).toBeVisible();
  expect(within(engagement).getByText("Comments")).toBeVisible();
  expect(within(engagement).getByText("Saves")).toBeVisible();
});
