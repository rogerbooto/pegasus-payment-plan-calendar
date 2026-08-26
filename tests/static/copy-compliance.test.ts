/**
 * @vitest-environment jsdom
 *
 * Copy-compliance gate: no user-facing string this extension actually
 * renders may match a blocked advice/verdict/score/alarm/protective-claim
 * pattern. The rule (this codebase's regulatory shelter): show a calendar,
 * not a verdict. "Shows you", never "protects you"; a plan or its dates are
 * the sentence subject, never "you" plus a judgement.
 *
 * This test renders every reachable screen through the REAL component
 * functions (never a copy of their output, never a hand-picked subset of
 * constants) and scans what actually lands in the DOM: text nodes, plus a
 * narrow allowlist of user-visible attributes (aria-label, alt, title,
 * placeholder). It deliberately does NOT scan attribute NAMES or the
 * values of structural/ARIA-state attributes (role, aria-live,
 * aria-atomic, aria-checked, aria-hidden, aria-labelledby, id, class,
 * style, for, type, href, lang) — a prior version of this kind of check
 * flagged `role="alert"` as a violation (the word "alert" is blocked),
 * which is a false positive: `role="alert"` is ARIA plumbing, not copy a
 * user reads. Excluding it is a deliberate, tested scoping decision, not
 * an oversight — see the dedicated regression test below.
 *
 * RED when: any rendered screen contains a blocked word/phrase, or when
 * the false-positive guard (role/aria attribute exclusion) regresses.
 */
import { describe, expect, it, vi } from "vitest";
import { createOverlayHost } from "../../src/overlay/OverlayHost";
import { renderConfirmationSheet, renderManualEntrySheet } from "../../src/overlay/ConfirmationSheet";
import { renderToolbarVerification } from "../../src/overlay/ToolbarVerification";
import { createPopupApp } from "../../src/popup/PopupApp";
import { PlanLedger } from "../../src/storage/ledger";
import { markViewedNext30 } from "../../src/popup/usage-tracking";
import type { KeyValueStore } from "../../src/storage/store";
import type { EngineState, PaymentPlanRecord, ScheduleCandidate } from "../../src/shared/types";
import { assertCents } from "../../src/shared/money";

// ---------------------------------------------------------------------------
// The ruleset. Copied verbatim (line-for-line, comments and all) from this
// project's advice-boundary copy ruleset. Word-boundary, case-insensitive.
// Each line is ONE independent RegExp — several lines contain an internal
// `|` alternation, kept exactly as authored rather than "cleaned up".
// ---------------------------------------------------------------------------
const BLOCKED_COPY_PATTERN_SOURCES: readonly string[] = [
  // Affordability verdicts
  String.raw`\bafford(s|ed|able|ability)?\b`,
  String.raw`\boverdra(w|wn|ft)\b`,
  String.raw`\bcan(no|')t\s+(cover|handle|manage)\b`,
  // Directive / prescriptive
  String.raw`\bskip\s+this\b`,
  String.raw`\b(don'?t|do\s+not)\s+buy\b`,
  String.raw`\bpay\s+in\s+full\s+instead\b`,
  String.raw`\byou\s+should\b`,
  String.raw`\bwe\s+(recommend|advise|suggest)\b`,
  String.raw`\bavoid\s+(this|these)\b`,
  String.raw`\bcancel\s+(this|the)\b`,
  // Scores and grades
  String.raw`\bscore(s|d)?\b`,
  String.raw`\bgrade(s|d)?\b`,
  String.raw`\brating(s)?\b`,
  String.raw`\b\d{1,3}\s*/\s*100\b`,
  // Verdict / alarm words (rename ruling)
  String.raw`\bwarning(s)?\b`,
  String.raw`\bcollision(s)?\b`,
  String.raw`\balarm(s|ed|ing)?\b`,
  String.raw`\balert(s|ed)?\b`,
  String.raw`\bdanger(ous)?\b`,
  String.raw`\brisk(y|s)?\b`,
  String.raw`\bred\s+flag(s)?\b`,
  String.raw`\btrouble\b`,
  String.raw`\bunsafe\b`,
  // ECOA / adverse-action vocabulary (full set — never near a credit decision)
  String.raw`\bdeclin(e|ed|ing)\b`,
  String.raw`\bdenied|\bdeny(ing)?\b`,
  String.raw`\b(not\s+)?approv(e|ed|al|ing)\b`,
  String.raw`\bineligible\b|\beligib(le|ility)\b`,
  String.raw`\bqualif(y|ied|ication)\b`,
  String.raw`\bcredit[-\s]?worth(y|iness)\b`,
  // Duty-of-care inflation (marketing + product)
  String.raw`\bprotect(s|ed|ion|ing)?\b`,
  String.raw`\bguard(s|ed|ian|ing)?\b`,
  String.raw`\bshield(s|ed|ing)?\b`,
  String.raw`\bdefend(s|ed|ing)?\b`,
  String.raw`\bkeep(s)?\s+you\s+safe\b`,
  String.raw`\bwatch(es|ing)?\s+over\b`,
];

// 35 lines, matching the ruleset exactly (the prose summary elsewhere says
// 33 — this file uses the actual regex block, the source of truth).
const EXPECTED_PATTERN_COUNT = 35;

const BLOCKED_COPY_PATTERNS: readonly RegExp[] = BLOCKED_COPY_PATTERN_SOURCES.map((s) => new RegExp(s, "i"));

/** Reviewed exceptions: a string that legitimately contains a blocked word
 * outside of user-facing copy scope. Empty today — if one is ever needed,
 * it must carry a comment naming which pattern and why. */
const REVIEWED_EXCEPTIONS: ReadonlySet<string> = new Set();

/**
 * User-visible attributes worth scanning: things a user actually reads
 * (a label, alt text, a title tooltip, placeholder text). Deliberately
 * excludes structural/ARIA-state attributes whose VALUES are framework
 * tokens, not prose — role, aria-live, aria-atomic, aria-checked,
 * aria-hidden, aria-labelledby (an ID reference, not text), id, class,
 * style, for, type, href, lang. Attribute NAMES are never scanned, only
 * the values of this specific allowlist.
 */
const USER_VISIBLE_ATTRS = ["aria-label", "alt", "title", "placeholder"] as const;

/** The exact extraction the copy-compliance check runs against a rendered
 * subtree: every text node's data, plus the allowlisted attribute values
 * on every element. Exported implicitly via the liveness tests below. */
function collectUserFacingStrings(root: ParentNode): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_ALL);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (value.trim().length > 0) out.push(value);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      for (const attr of USER_VISIBLE_ATTRS) {
        const value = element.getAttribute(attr);
        if (value && value.trim().length > 0) out.push(value);
      }
    }
    node = walker.nextNode();
  }
  return out;
}

function scanCorpus(strings: readonly string[]): { text: string; pattern: RegExp }[] {
  const violations: { text: string; pattern: RegExp }[] = [];
  for (const value of strings) {
    if (REVIEWED_EXCEPTIONS.has(value)) continue;
    for (const pattern of BLOCKED_COPY_PATTERNS) {
      if (pattern.test(value)) violations.push({ text: value, pattern });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Rendering: every reachable screen, via the real components, never a
// hand-picked constant list.
// ---------------------------------------------------------------------------

function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const data: Record<string, unknown> = { ...initial };
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in data) out[k] = data[k];
      return out;
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of keys) delete data[k];
    },
  };
}

function samplePlan(id: string): PaymentPlanRecord {
  return {
    id,
    createdAt: "2026-06-01",
    source: "manual",
    currency: "CAD",
    orderTotalCents: assertCents(6000, "total"),
    installmentCount: 4,
    cadence: "MONTHLY",
    perInstallmentCents: assertCents(1500, "each"),
    firstPaymentDate: "2026-06-01",
  };
}

const candidate: ScheduleCandidate = {
  orderTotalCents: assertCents(15000, "total"),
  installmentCount: 4,
  cadence: "BIWEEKLY",
  perInstallmentCents: assertCents(3750, "each"),
  currency: "CAD",
  confidence: { hardGatesPassed: true, softScore: 6, signals: [] },
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Mount an OverlayHost and capture the strings rendered INSIDE its closed
 * shadow root.
 *
 * Why this exists: the panel deliberately uses `attachShadow({mode:"closed"})`
 * (T11), so `document.body` traversal cannot reach its content — which is the
 * whole point of a closed root. Collecting from `document.body` therefore
 * captured NOTHING from the panel, and this file silently scanned only the
 * sheets and the popup. A planted violation in a panel-only string
 * (NOT_RECOGNIZED) passed this suite, which is exactly the vacuous-guard
 * failure this file is supposed to prevent.
 *
 * The wrapper is scoped to the mount and always restored.
 */
async function collectFromOverlay(state: EngineState, store: ReturnType<typeof memoryStore>): Promise<string[]> {
  const ledger = new PlanLedger(store);
  const originalAttachShadow = Element.prototype.attachShadow;
  let captured: ShadowRoot | null = null;
  Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    const root = originalAttachShadow.call(this, { ...init, mode: "open" });
    captured = root;
    return root;
  };
  try {
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount(state);
    await flush();
    if (!captured) throw new Error("fixture drift: attachShadow was never invoked for the overlay host");
    const strings = collectUserFacingStrings(captured as unknown as ParentNode);
    controller.unmount();
    return strings;
  } finally {
    Element.prototype.attachShadow = originalAttachShadow;
  }
}

async function collectAllRenderedCopy(): Promise<string[]> {
  const collected: string[] = [];

  // --- overlay: ConfirmationSheet + ManualEntrySheet, standalone ---
  const el1 = document.createElement("div");
  document.body.appendChild(el1);
  renderConfirmationSheet(el1, { candidate, onConfirm: vi.fn(), onCancel: vi.fn() });
  collected.push(...collectUserFacingStrings(el1));

  const el2 = document.createElement("div");
  document.body.appendChild(el2);
  renderManualEntrySheet(el2, { onConfirm: vi.fn(), onCancel: vi.fn() });
  collected.push(...collectUserFacingStrings(el2));

  const el3 = document.createElement("div");
  document.body.appendChild(el3);
  renderManualEntrySheet(el3, {
    prefill: { orderTotalCents: assertCents(19600, "total"), installmentCount: 4, confidence: { hardGatesPassed: false, softScore: 0, signals: [] } },
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  });
  collected.push(...collectUserFacingStrings(el3));

  // --- overlay: ToolbarVerification, standalone ---
  const el4 = document.createElement("div");
  document.body.appendChild(el4);
  renderToolbarVerification(el4, { onBack: vi.fn() });
  collected.push(...collectUserFacingStrings(el4));

  // --- OverlayHost: every terminal EngineState, plus post-confirm / removed ---
  // NOTE: panel content lives in a CLOSED shadow root — see collectFromOverlay.
  document.body.replaceChildren();
  {
    const store = memoryStore();
    collected.push(...(await collectFromOverlay({ kind: "PARSED_CONFIRMABLE", candidate }, store)));
  }
  {
    const store = memoryStore();
    collected.push(...(await collectFromOverlay({ kind: "DEGRADED", reason: "no_match" }, store)));
  }
  {
    // The pre-gate's own degraded state (src/engine/pre-gate.ts,
    // src/engine/lifecycle.ts): a path/adapter signal fired with no
    // affordance confirmation, so it renders NOT_CONFIRMED, not
    // NOT_RECOGNIZED -- a distinct string, so it needs its own scan.
    const store = memoryStore();
    collected.push(...(await collectFromOverlay({ kind: "DEGRADED", reason: "unconfirmed" }, store)));
  }
  {
    const store = memoryStore();
    collected.push(...(await collectFromOverlay({
      kind: "PARTIAL",
      candidate: { orderTotalCents: assertCents(19600, "total"), installmentCount: 4, confidence: { hardGatesPassed: false, softScore: 0, signals: [] } },
      missing: ["cadence"],
    }, store)));
  }
  {
    // Post-confirm ("saved") screen: PARSED_CONFIRMABLE with an existing
    // plan already on the ledger.
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(samplePlan("11111111-1111-4111-8111-111111111111"));
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount({ kind: "PARSED_CONFIRMABLE", candidate });
    await flush();
    collected.push(...collectUserFacingStrings(document.body));
    controller.unmount();
  }
  {
    // The Next-30 tab. Its content lives inside the closed shadow root,
    // unreachable via `.shadowRoot` from outside by design (T11) — capture
    // it the same way overlay-host-structural.test.ts does. A FRESH
    // controller is required here: `unmount()` marks dismissal final for
    // the session (mount() after unmount() is a deliberate no-op per the
    // OverlayHost contract), so re-mounting the SAME controller instance
    // silently skips ensureHost()/attachShadow() entirely — confirmed while
    // building this test, where that exact mistake made the Next-30 tab's
    // copy invisible to this scan without any test failure.
    const store = memoryStore();
    const ledger = new PlanLedger(store);
    await ledger.addPlan(samplePlan("33333333-3333-4333-8333-333333333333"));

    const originalAttachShadow = Element.prototype.attachShadow;
    const box: { root: ShadowRoot | null } = { root: null };
    Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
      const root = originalAttachShadow.call(this, init);
      box.root = root;
      return root;
    };
    const controller = createOverlayHost(document, { store, ledger, today: () => "2026-06-01" });
    controller.mount({ kind: "PARSED_CONFIRMABLE", candidate });
    await flush();
    Element.prototype.attachShadow = originalAttachShadow;
    const captured = box.root;
    if (!captured) throw new Error("fixture drift: attachShadow was never invoked for the Next-30 controller");
    const next30Tab = [...captured.querySelectorAll("button")].find((b) => b.textContent === "Next 30 days");
    if (!next30Tab) throw new Error('fixture drift: expected a "Next 30 days" tab button once a plan exists');
    (next30Tab as HTMLButtonElement).click();
    await flush();
    collected.push(...collectUserFacingStrings(captured));
    controller.unmount();
  }

  // --- PopupApp: onboard, hero (empty + with plan + invite), settings, verify, manual ---
  document.body.replaceChildren();
  {
    const store = memoryStore();
    const app = createPopupApp(document.createElement("div"), { store });
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createPopupApp(root, { store }).init();
    collected.push(...collectUserFacingStrings(root));
    void app;
  }
  // --- src/welcome/welcome.ts mounts this exact same onboarding screen
  // with showPinHint: true (the one extra line, ONBOARD_PIN_HINT, telling
  // a fresh install where the toolbar icon lives) -- covered here rather
  // than in a second, duplicated copy-compliance file for that surface.
  {
    const store = memoryStore();
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createPopupApp(root, { store, showPinHint: true }).init();
    collected.push(...collectUserFacingStrings(root));
  }
  {
    const store = memoryStore({ settings: { measurementEnabled: false } });
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createPopupApp(root, { store }).init();
    collected.push(...collectUserFacingStrings(root));

    const gear = [...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Settings") as HTMLButtonElement | undefined;
    gear?.click();
    await flush();
    collected.push(...collectUserFacingStrings(root));

    const howGenuine = [...root.querySelectorAll("button")].find((b) => b.textContent === "How to know it's genuine") as HTMLButtonElement | undefined;
    howGenuine?.click();
    await flush();
    collected.push(...collectUserFacingStrings(root));
  }
  {
    const plan = samplePlan("22222222-2222-4222-8222-222222222222");
    const store = memoryStore({ settings: { measurementEnabled: false }, plans: [plan] });
    await markViewedNext30(store);
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createPopupApp(root, { store, today: () => "2026-06-01" }).init();
    collected.push(...collectUserFacingStrings(root));

    const addBtn = [...root.querySelectorAll("button")].find((b) => b.textContent === "Add a plan") as HTMLButtonElement | undefined;
    addBtn?.click();
    await flush();
    collected.push(...collectUserFacingStrings(root));
  }

  document.body.replaceChildren();
  return collected;
}

describe("copy-compliance — no blocked pattern in any rendered user-facing string", () => {
  it("liveness — the ruleset carries all 35 authored patterns (a truncated import must not pass vacuously)", () => {
    expect(BLOCKED_COPY_PATTERNS.length).toBe(EXPECTED_PATTERN_COUNT);
  });

  it("liveness — the scanner catches a planted violation of each rule class", () => {
    const planted = [
      "You can't afford this right now.",
      "You're overdrawn.",
      "Skip this purchase.",
      "You should reconsider.",
      "We recommend paying in full.",
      "This gets a score of 42.",
      "Payment warning: two dates collide.",
      "This is risky.",
      "Your application was denied.",
      "You may not be eligible for this.",
      "This protects you from overspending.",
      "We watch over your spending.",
    ];
    for (const s of planted) {
      expect(scanCorpus([s]).length, `expected "${s}" to be flagged`).toBeGreaterThan(0);
    }
  });

  it("liveness — a genuinely clean, approved-shape string is not flagged (no false positive on ordinary copy)", () => {
    const clean = [
      "This plan adds 4 payments of $37.50 on Jun 3, Jun 17, Jul 1, Jul 15.",
      "Two payments you recorded also fall on Jun 3 — $75.00 that day.",
      "Based only on plans you entered.",
      "We don't recognize this checkout yet. You can add the plan manually.",
      "Everything stays on this device.",
    ];
    expect(scanCorpus(clean)).toEqual([]);
  });

  it("regression — role/aria attribute VALUES are excluded, so role=\"alert\"/role=\"status\"/role=\"switch\" never false-positive", () => {
    const container = document.createElement("div");
    const p = document.createElement("p");
    p.setAttribute("role", "alert");
    p.textContent = "That didn't save. Your browser storage may be full. Try again, or check the extension's settings.";
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const sw = document.createElement("button");
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", "true");
    container.append(p, status, sw);

    // The exact guard: RED if the scanner is ever changed to scan
    // attribute NAMES or the role/aria-live/aria-checked attribute VALUES
    // themselves ("alert" and "status" would otherwise match the blocked
    // "alert"/no-op patterns, and this whole test file would be unusable
    // against a codebase that (correctly) uses ARIA roles).
    expect(scanCorpus(collectUserFacingStrings(container))).toEqual([]);
  });

  it("liveness — the render pass produces a non-trivial, plausibly-sized corpus (a broken render harness must not pass on nothing)", async () => {
    const corpus = await collectAllRenderedCopy();
    expect(corpus.length).toBeGreaterThan(40);
  });

  it("no rendered screen contains a blocked-vocabulary string", async () => {
    const corpus = await collectAllRenderedCopy();
    const violations = scanCorpus(corpus);
    expect(
      violations,
      violations.map((v) => `"${v.text}" matched ${v.pattern}`).join("\n"),).toEqual([]);
  });
});
