/**
 * The engine's single orchestration entrypoint: given a page and the shared
 * extraction core, produce exactly one terminal EngineState. This is what
 * ties registry.ts (precedence), the adapters and the generic detector
 * together per the design spec's fallback rule:
 *
 *   Fallback is one-directional and single-step (adapter -> generic ->
 *   degraded), never a retry loop. Exactly one adapter extracts per
 *   checkout session -- never merge scalars across adapters.
 *
 * What counts as an adapter "failing" (triggering the single fallback
 * step), read precisely against D6's text:
 *   - `locate()` throws, or returns null (no anchor found at all);
 *   - `extract()` throws (an adapter runtime error -- "a thrown adapter is
 *     equivalent to no match", registry.ts's own docstring, extended here
 *     to extract() as well as match());
 *   - `extract()` itself resolves to DEGRADED (the adapter found nothing
 *     it could hard-gate at all).
 * A PARTIAL or PARSED_CONFIRMABLE result from the winning adapter is
 * returned AS-IS -- it is not "below the confidence floor" in the sense
 * that triggers fallback; it is a legitimate, first-class terminal state
 *, and it is more precise than anything the generic path could
 * produce (the generic path lacks the `adapter_path` soft signal by
 * definition). Falling back on a legitimate PARTIAL would also violate
 * "never merge scalars across adapters" in spirit, since the generic
 * detector re-scanning the same page is effectively a second extraction
 * attempt on the same session.
 */
import type { EngineState } from "../shared/types";
import type { AnchorSet, CheckoutAdapter, ExtractionCore, PageProbe } from "./types";
import { selectAdapter } from "./registry";
import { detectCheckout, detectInstallmentOffer, extractGeneric } from "./generic-detector";

const FALLBACK = Symbol("fallback");

function tryAdapter(adapter: CheckoutAdapter, page: PageProbe, core: ExtractionCore): EngineState | typeof FALLBACK {
  let anchors: AnchorSet | null;
  try {
    anchors = adapter.locate(page);
  } catch {
    return FALLBACK;
  }
  if (!anchors) return FALLBACK;

  let state: EngineState;
  try {
    state = adapter.extract(anchors, core);
  } catch {
    return FALLBACK;
  }
  if (state.kind === "DEGRADED") return FALLBACK;
  return state;
}

function runGeneric(page: PageProbe, core: ExtractionCore): EngineState {
  if (!detectCheckout(page) || !detectInstallmentOffer(page)) {
    return { kind: "DEGRADED", reason: "no_match" };
  }
  return extractGeneric(page, core);
}

/**
 * The fallback logic itself, parameterized over an already-selected
 * adapter (or null), so it is independently testable against fake adapters
 * (a throwing extract(), a null locate(), a legitimate PARTIAL that must
 * NOT trigger fallback) without needing real bundled config / real hosts
 * to construct those scenarios. `runEngine` below is the sanctioned
 * entrypoint, always called with registry.ts's real `selectAdapter`.
 */
export function runEngineWithAdapter(
  adapter: CheckoutAdapter | null,
  page: PageProbe,
  core: ExtractionCore,): EngineState {
  if (!adapter) return runGeneric(page, core);

  const result = tryAdapter(adapter, page, core);
  if (result !== FALLBACK) return result;

  const genericState = runGeneric(page, core);
  // A platform WAS recognized (an adapter matched) but couldn't produce a
  // trustworthy result, and the generic fallback couldn't do better either
  // -- surface the more specific, honest reason rather than "no_match".
  if (genericState.kind === "DEGRADED") return { kind: "DEGRADED", reason: "adapter_error" };
  return genericState;
}

/**
 * Selects the winning adapter (registry.ts's precedence rule), attempts
 * its extraction, and falls back to the generic detector exactly once on
 * failure. Every checkout session ends in exactly one of the three states
 * -- there is no code path that returns anything else.
 */
export function runEngine(page: PageProbe, core: ExtractionCore): EngineState {
  return runEngineWithAdapter(selectAdapter(page), page, core);
}
