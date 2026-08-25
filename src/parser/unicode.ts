/**
 * Text normalization ahead of money/phrase parsing. Strings containing
 * direction-override or zero-width control characters, or digits outside
 * ASCII 0-9 that cannot be normalized to an unambiguous ground truth, are
 * rejected — never silently stripped into a different number.
 */
import { NotImplementedError } from "../shared/errors";

export type UnicodeResult =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "rejected" };

export function normalizeOrReject(_raw: string): UnicodeResult {
  throw new NotImplementedError("parser/unicode#normalizeOrReject");
}
