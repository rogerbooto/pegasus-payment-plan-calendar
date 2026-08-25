/**
 * The overlay host: a custom element mounted as a direct child of
 * document.body (never inside a payment form or lender iframe), with a
 * closed shadow root and an `all: initial` style reset at the boundary.
 * The extension never modifies checkout DOM — no attribute, class or node
 * of ours appears in page DOM outside this single host element.
 *
 * The host renders from the engine's parsed integer-cent values only; it
 * never live-mirrors page nodes, so a post-parse DOM mutation cannot alter
 * what the user is confirming.
 */
import type { EngineState } from "../shared/types";
import { NotImplementedError } from "../shared/errors";
export { OVERLAY_HOST_TAG } from "../shared/constants";

export interface OverlayController {
  /** Mounts (or updates) the overlay for a terminal engine state. */
  mount(state: EngineState): void;
  /** Full teardown: removes the host, cancels timers, drops references. */
  unmount(): void;
}

export function createOverlayHost(_doc: Document): OverlayController {
  throw new NotImplementedError("overlay/OverlayHost#createOverlayHost");
}
