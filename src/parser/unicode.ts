/**
 * Text normalization ahead of money/phrase parsing.
 * Strings containing direction-override or zero-width control characters
 * are rejected outright — they can reorder or hide what a human sees vs.
 * what a parser reads. Digits outside ASCII 0-9 are normalized ONLY when
 * they come from one, single, unambiguous digit block (Eastern Arabic-
 * Indic, Extended Arabic-Indic/Persian, or fullwidth) via a fixed
 * code-point offset — never guessed. A character outside every known-safe
 * set (a homoglyph, an unrecognized script, a mix of two different
 * non-ASCII digit blocks in one string) is rejected, not silently dropped.
 */
export type UnicodeResult =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "rejected" };

/**
 * Bidi overrides/isolates and zero-width/invisible controls (D3 T03).
 * Written as explicit \u escapes, never literal invisible characters, so
 * the source stays auditable in a diff.
 */
const BIDI_AND_ZERO_WIDTH_CONTROLS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

/** Known, unambiguous non-ASCII decimal-digit blocks: a fixed code-point offset to 0-9. */
const DIGIT_BLOCKS: ReadonlyArray<{ readonly name: string; readonly base: number }> = [
  { name: "eastern-arabic-indic", base: 0x0660 },
  { name: "extended-arabic-indic", base: 0x06f0 },
  { name: "fullwidth", base: 0xff10 },
];

/** Non-digit characters this module passes through unchanged. */
const ALLOWED_NON_DIGIT = /[0-9A-Za-z$,.\s-]/;

export function normalizeOrReject(raw: string): UnicodeResult {
  if (BIDI_AND_ZERO_WIDTH_CONTROLS.test(raw)) return { kind: "rejected" };

  let usedBlock: string | null = null;
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code === undefined) return { kind: "rejected" };

    if (code >= 0x0030 && code <= 0x0039) {
      out += ch; // already an ASCII digit
      continue;
    }

    const block = DIGIT_BLOCKS.find((b) => code >= b.base && code <= b.base + 9);
    if (block) {
      if (usedBlock !== null && usedBlock !== block.name) {
        return { kind: "rejected" }; // mixed non-ASCII digit scripts in one string
      }
      usedBlock = block.name;
      out += String(code - block.base);
      continue;
    }

    if (ALLOWED_NON_DIGIT.test(ch)) {
      out += ch;
      continue;
    }

    return { kind: "rejected" }; // unrecognized script / homoglyph
  }

  return { kind: "ok", text: out };
}
