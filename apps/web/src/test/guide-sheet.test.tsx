import type { components } from "@shopping-guide/contracts/src/api";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GuideSheet, claimStatusLabel } from "@/components/guide-sheet";

const api = vi.hoisted(() => ({
  createGuideSession: vi.fn(),
  sendGuideMessage: vi.fn(),
}));

vi.mock("@/lib/api-client", () => api);

type GuideTurn = components["schemas"]["GuideTurnResponse"];

const context: components["schemas"]["ContentContextSummary"] = {
  id: "morning-routine-uv-001",
  anchor_product_id: "seoul-shade-daily-fluid",
  anchor_product_name: "Seoul Shade Daily Fluid",
  creator_handle: "@routine.notes",
  caption: "A lightweight SPF step for a humid commute",
  claims: [
    {
      claim_id: "claim-supported",
      evidence_id: "fda-sunscreen-basics",
      status: "SUPPORTED",
      text: "Broad-spectrum sunscreen is relevant for daily UV protection.",
    },
    {
      claim_id: "claim-conflicting",
      evidence_id: "fda-water-resistance-labeling",
      status: "CONFLICTING",
      text: "A sunscreen can be treated as waterproof all day.",
    },
    {
      claim_id: "claim-insufficient",
      evidence_id: "fda-sunscreen-basics",
      status: "INSUFFICIENT_EVIDENCE",
      text: "This exact formula leaves no white cast on every complexion.",
    },
    {
      claim_id: "claim-mixed",
      evidence_id: "synthetic-review-finish-aggregate",
      status: "SUBJECTIVE_MIXED",
      text: "The finish feels weightless under makeup.",
    },
  ],
};

const clarificationTurn: GuideTurn = {
  session_id: "ses_guide_1",
  trace_id: "trace_guide_1",
  state: "CLARIFY",
  kind: "clarification",
  text: "Is water resistance a must, or is this mainly for a daily commute?",
  context,
  quick_replies: [
    "Daily commute",
    "40 min water resistance",
    "80 min water resistance",
  ],
};

const publicEvidence: components["schemas"]["EvidenceReference"] = {
  evidence_id: "fda-sunscreen-basics",
  source_kind: "public_rule",
  status: "SUPPORTED",
  synthetic: false,
  title: "FDA sunscreen labeling guide",
  summary: "Broad-spectrum labeling and directions work together.",
  url: "https://www.fda.gov/drugs/sunscreen-guide",
};

const syntheticEvidence: components["schemas"]["EvidenceReference"] = {
  evidence_id: "synthetic-review-finish-aggregate",
  source_kind: "synthetic_review_aggregate",
  status: "SUBJECTIVE_MIXED",
  synthetic: true,
  title: "Synthetic review aggregate: Seoul Shade finish",
  summary:
    "Synthetic benchmark opinions are mixed and are not external user research.",
  url: "https://evidence.local.invalid/synthetic-review-finish-aggregate",
};

const recommendationTurn: GuideTurn = {
  ...clarificationTurn,
  state: "PRESENT_RECOMMENDATION",
  kind: "recommendation",
  verdict: "SUITABLE",
  text: "These options pass your must-haves. Review the tradeoffs before choosing a size.",
  quick_replies: [],
  evidence: [publicEvidence, syntheticEvidence],
  recommendations: [
    {
      product_id: "seoul-shade-daily-fluid",
      brand: "Mirae Lab",
      name: "Seoul Shade Daily Fluid",
      verdict: "SUITABLE",
      starting_price_usd: 14,
      fit_reasons: ["natural finish", "listed for sensitive skin"],
      tradeoffs: ["No labeled water resistance", "Reapply for extended exposure"],
      evidence_ids: [
        "fda-sunscreen-basics",
        "synthetic-review-finish-aggregate",
      ],
      eligible_sku_ids: ["seoul-shade-30", "seoul-shade-50"],
    },
    {
      product_id: "cloud-veil-mineral",
      brand: "Han River Skin",
      name: "Cloud Veil Mineral SPF",
      verdict: "CONDITIONAL",
      starting_price_usd: 17,
      fit_reasons: ["fragrance-free"],
      tradeoffs: ["Medium white-cast risk"],
      evidence_ids: ["fda-sunscreen-basics"],
      eligible_sku_ids: ["cloud-veil-30"],
    },
  ],
};

const noMatchTurn: GuideTurn = {
  ...clarificationTurn,
  state: "PRESENT_RECOMMENDATION",
  kind: "no_match",
  verdict: "NOT_RECOMMENDED",
  text: "No product meets every stated must-have. I won't silently relax a hard constraint; change one requirement to continue.",
  quick_replies: [],
  evidence: [publicEvidence],
  recommendations: [],
};

const safetyTurn: GuideTurn = {
  ...clarificationTurn,
  kind: "safety_boundary",
  text: "I can compare labeled sunscreen facts, but I can't diagnose or treat a reaction. Seek a qualified medical professional.",
  quick_replies: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  api.createGuideSession.mockReset();
  api.sendGuideMessage.mockReset();
  api.createGuideSession.mockResolvedValue(clarificationTurn);
  api.sendGuideMessage.mockResolvedValue(recommendationTurn);
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

it.each([
  ["SUPPORTED", "Supported by source"],
  ["CONFLICTING", "Conflicts with source"],
  ["INSUFFICIENT_EVIDENCE", "Not enough evidence"],
  ["SUBJECTIVE_MIXED", "Mixed subjective reports"],
] as const)("maps %s without collapsing evidence states", (status, label) => {
  expect(claimStatusLabel(status)).toBe(label);
});

it("opens one content session and makes inherited context, one question, and every claim state explicit", async () => {
  render(<GuideSheet open onClose={vi.fn()} />);

  expect(
    screen.getByRole("dialog", { name: "AI shopping guide" }),
  ).toHaveAttribute("aria-modal", "true");
  expect(screen.getByRole("button", { name: "Close AI shopping guide" })).toHaveFocus();
  expect(screen.getByLabelText("Your must-haves")).toBeDisabled();

  await screen.findByText(clarificationTurn.text);

  expect(api.createGuideSession).toHaveBeenCalledOnce();
  expect(api.createGuideSession).toHaveBeenCalledWith("morning-routine-uv-001");
  expect(screen.getByText("@routine.notes")).toBeVisible();
  expect(screen.getByText("Seoul Shade Daily Fluid")).toBeVisible();
  expect(screen.getByText("seoul-shade-daily-fluid")).toBeVisible();
  expect(screen.getByText(context.caption)).toBeVisible();
  expect(screen.getByRole("heading", { name: "Creator claims checked" })).toBeVisible();
  for (const claim of context.claims) {
    expect(screen.getByText(claim.text)).toBeVisible();
    expect(screen.getByText(claimStatusLabel(claim.status))).toBeVisible();
  }
  for (const reply of clarificationTurn.quick_replies ?? []) {
    expect(screen.getByRole("button", { name: reply })).toBeVisible();
  }
  expect(screen.getByLabelText("Your must-haves")).toBeEnabled();
  expect(screen.getByText("AI can make mistakes · Check product labels")).toBeVisible();
});

it("keeps the clarification visible while submitting and synchronously blocks duplicate submits", async () => {
  const user = userEvent.setup();
  const pending = deferred<GuideTurn>();
  api.sendGuideMessage.mockReturnValue(pending.promise);
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);

  const input = screen.getByLabelText("Your must-haves");
  await user.type(input, "Under $20, fragrance-free, natural finish");
  const form = input.closest("form");
  expect(form).not.toBeNull();

  fireEvent.submit(form!);
  fireEvent.submit(form!);

  expect(screen.getByText(clarificationTurn.text)).toBeVisible();
  expect(screen.getByText("Checking product facts…")).toBeVisible();
  expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  expect(api.sendGuideMessage).toHaveBeenCalledOnce();
  expect(api.sendGuideMessage).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^msg_/),
    "Under $20, fragrance-free, natural finish",
  );

  await act(async () => pending.resolve(recommendationTurn));
  expect(await screen.findByText("Closest fit")).toBeVisible();
});

it("submits a quick reply and renders API-grounded recommendation facts without cart actions", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);

  await user.click(screen.getByRole("button", { name: "Daily commute" }));
  const closest = await screen.findByText("Closest fit");
  const card = closest.closest("article");
  expect(card).not.toBeNull();

  expect(api.sendGuideMessage).toHaveBeenCalledWith(
    "ses_guide_1",
    expect.stringMatching(/^msg_/),
    "Daily commute",
  );
  expect(within(card!).getByText("Mirae Lab")).toBeVisible();
  expect(within(card!).getByText("Seoul Shade Daily Fluid")).toBeVisible();
  expect(within(card!).getByText("$14.00")).toBeVisible();
  expect(within(card!).getByText("natural finish")).toBeVisible();
  expect(within(card!).getByText("listed for sensitive skin")).toBeVisible();
  expect(within(card!).getByText("No labeled water resistance")).toBeVisible();
  expect(within(card!).getByText("Reapply for extended exposure")).toBeVisible();
  expect(within(card!).getByText("2 evidence sources")).toBeVisible();
  expect(within(card!).getByRole("combobox", { name: "Size for Seoul Shade Daily Fluid" })).toHaveValue("seoul-shade-30");
  expect(within(card!).getByRole("checkbox", { name: "Compare Seoul Shade Daily Fluid" })).toBeVisible();
  expect(screen.getAllByText("Closest fit")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /add/i })).not.toBeInTheDocument();
});

it("resets a lifted SKU selection when the same product returns with different eligible SKUs", async () => {
  const user = userEvent.setup();
  const changedSkuTurn: GuideTurn = {
    ...recommendationTurn,
    recommendations: [
      {
        ...recommendationTurn.recommendations![0],
        eligible_sku_ids: ["seoul-shade-75"],
      },
    ],
  };
  api.sendGuideMessage
    .mockResolvedValueOnce(recommendationTurn)
    .mockResolvedValueOnce(changedSkuTurn);
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));

  const selector = await screen.findByRole("combobox", {
    name: "Size for Seoul Shade Daily Fluid",
  });
  await user.selectOptions(selector, "seoul-shade-50");
  expect(selector).toHaveValue("seoul-shade-50");
  await user.type(screen.getByLabelText("Your must-haves"), "Now under $18");
  fireEvent.submit(screen.getByLabelText("Your must-haves").closest("form")!);

  expect(
    await screen.findByRole("combobox", {
      name: "Size for Seoul Shade Daily Fluid",
    }),
  ).toHaveValue("seoul-shade-75");
});

it("keeps public rules authoritative and labels synthetic evidence as a benchmark", async () => {
  const user = userEvent.setup();
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.click(screen.getByRole("button", { name: "Daily commute" }));

  const publicLink = await screen.findByRole("link", {
    name: /FDA sunscreen labeling guide/,
  });
  expect(publicLink).toHaveAttribute("href", publicEvidence.url);
  expect(publicLink).toHaveAttribute("target", "_blank");
  expect(publicLink).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  const syntheticPanel = screen
    .getByText("Synthetic benchmark")
    .closest("article");
  expect(syntheticPanel).not.toBeNull();
  expect(within(syntheticPanel!).getByText(syntheticEvidence.title)).toBeVisible();
  expect(within(syntheticPanel!).queryByRole("link")).not.toBeInTheDocument();
  expect(
    within(syntheticPanel!).getAllByText(/not external user research/i),
  ).toHaveLength(2);
});

it("renders a no-match recovery without silently offering an add action", async () => {
  const user = userEvent.setup();
  api.sendGuideMessage.mockResolvedValue(noMatchTurn);
  render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.type(
    screen.getByLabelText("Your must-haves"),
    "Under $15, fragrance-free, 80 minute water resistance",
  );
  await user.click(screen.getByRole("button", { name: "Find my match" }));

  expect(await screen.findByRole("heading", { name: "Change one requirement" })).toBeVisible();
  expect(screen.getAllByText(/won't silently relax/i)).toHaveLength(1);
  expect(screen.queryByText("Closest fit")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /add/i })).not.toBeInTheDocument();
});

it("renders safety and opening-error states without recommendations", async () => {
  const user = userEvent.setup();
  api.sendGuideMessage.mockResolvedValueOnce(safetyTurn);
  const { unmount } = render(<GuideSheet open onClose={vi.fn()} />);
  await screen.findByText(clarificationTurn.text);
  await user.type(screen.getByLabelText("Your must-haves"), "Diagnose this rash");
  await user.click(screen.getByRole("button", { name: "Find my match" }));

  expect(await screen.findByRole("heading", { name: "Safety boundary" })).toBeVisible();
  expect(screen.getAllByText(/qualified medical professional/i)).toHaveLength(1);
  expect(screen.queryByText("Closest fit")).not.toBeInTheDocument();

  unmount();
  api.createGuideSession.mockRejectedValueOnce(new Error("offline"));
  render(<GuideSheet open onClose={vi.fn()} />);
  expect(await screen.findByRole("heading", { name: "Guide unavailable" })).toBeVisible();
  expect(screen.getByText(/close the guide and try again/i)).toBeVisible();
});

describe("dialog lifecycle", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Ask AI about this product
        </button>
        <GuideSheet open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  it("traps focus, closes with Escape, returns focus, and creates once per reopen", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "Ask AI about this product",
    });

    await user.click(trigger);
    const close = screen.getByRole("button", {
      name: "Close AI shopping guide",
    });
    expect(close).toHaveFocus();
    await screen.findByText(clarificationTurn.text);
    expect(api.createGuideSession).toHaveBeenCalledTimes(1);

    await user.tab({ shift: true });
    expect(screen.getByLabelText("Your must-haves")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "AI shopping guide" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await screen.findByText(clarificationTurn.text);
    expect(api.createGuideSession).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale opening response after close and reopen", async () => {
    const user = userEvent.setup();
    const stale = deferred<GuideTurn>();
    const current = deferred<GuideTurn>();
    api.createGuideSession
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise);
    render(<Harness />);

    const trigger = screen.getByRole("button", {
      name: "Ask AI about this product",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Close AI shopping guide" }),
    );
    await user.click(trigger);
    await act(async () => current.resolve(clarificationTurn));
    expect(await screen.findByText(clarificationTurn.text)).toBeVisible();

    const staleTurn: GuideTurn = {
      ...clarificationTurn,
      text: "Stale response must not render",
    };
    await act(async () => stale.resolve(staleTurn));
    expect(screen.queryByText(staleTurn.text)).not.toBeInTheDocument();
    expect(screen.getByText(clarificationTurn.text)).toBeVisible();
  });

  it("creates one session per open cycle under StrictMode", async () => {
    render(
      <StrictMode>
        <GuideSheet open={true} onClose={vi.fn()} />
      </StrictMode>,
    );

    await screen.findByText(clarificationTurn.text);

    expect(api.createGuideSession).toHaveBeenCalledTimes(1);
  });
});
