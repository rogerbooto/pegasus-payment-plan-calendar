/**
 * Bundled selector-config validation. The config ships inside the extension
 * package — there is no remote-fetch path anywhere in this codebase, and a
 * coverage change ships as a store update, never a hot patch.
 *
 * The config is treated as untrusted input even though we author it:
 * validated at every load, fail-closed, per adapter. An adapter whose config
 * fails validation is disabled entirely (the engine falls back to the
 * generic detector, then honest degradation) — never "best effort".
 *
 * Rules enforced here:
 * - closed schema: unknown keys rejected;
 * - selectors are CSS only (inert by construction), length-capped,
 *   charset-restricted; no XPath, nothing interpolated from page data;
 * - pattern strings are a restricted language (literals + a fixed token
 *   set), never raw regular expressions;
 * - an adapter's hosts must be a subset of the manifest host permissions —
 *   config can narrow, never widen, where the engine runs.
 */
import { CONFIG_SCHEMA_VERSION } from "../shared/constants";
import type { AdapterId } from "../engine/types";

export interface AnchorConfig {
  readonly css: readonly string[];
  readonly labelLexicon?: readonly string[];
  readonly iframeOrigins?: readonly string[];
}

export interface AdapterConfig {
  readonly hosts: readonly string[];
  readonly pathPatterns: readonly string[];
  readonly anchors: {
    readonly orderTotal: AnchorConfig;
    readonly bnplWidget: AnchorConfig;
    readonly installmentText: { readonly patterns: readonly string[] };
  };
}

export interface ValidatedConfig {
  readonly schemaVersion: number;
  readonly adapters: ReadonlyMap<AdapterId, AdapterConfig>;
  /** Adapters disabled by validation failure, with their reasons. */
  readonly disabled: readonly { readonly id: string; readonly errors: readonly string[] }[];
}

const KNOWN_ADAPTER_IDS: readonly string[] = ["shopify-checkout", "stripe-hosted", "whop"];
const TOP_LEVEL_KEYS = ["schemaVersion", "engineMin", "adapters"] as const;
const ADAPTER_KEYS = ["hosts", "pathPatterns", "anchors"] as const;
const ANCHOR_GROUP_KEYS = ["orderTotal", "bnplWidget", "installmentText"] as const;

const MAX_SELECTOR_LENGTH = 200;
/** CSS selector charset: no quotes-free URL schemes, no braces, no backslash escapes. */
const CSS_SELECTOR_CHARSET = /^[A-Za-z0-9\s.#[\]="':,>+~*()_-]+$/;
/** Restricted pattern language: literals plus {count} {money} {cadence} tokens. */
const PATTERN_CHARSET = /^[A-Za-z0-9\s{}$,.'-]+$/;
const PATTERN_TOKENS = ["{count}", "{money}", "{cadence}"];
const HOST_CHARSET = /^[a-z0-9.-]+$/;
const PATH_PREFIX_CHARSET = /^\/[A-Za-z0-9/_-]*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function validateSelectors(css: unknown, errors: string[], where: string): void {
  if (!isStringArray(css)) {
    errors.push(`${where}.css must be an array of strings`);
    return;
  }
  for (const sel of css) {
    if (sel.length === 0 || sel.length > MAX_SELECTOR_LENGTH || !CSS_SELECTOR_CHARSET.test(sel)) {
      errors.push(`${where}.css contains an invalid selector`);
    }
  }
}

function validatePatterns(patterns: unknown, errors: string[], where: string): void {
  if (!isStringArray(patterns)) {
    errors.push(`${where}.patterns must be an array of strings`);
    return;
  }
  for (const p of patterns) {
    if (p.length === 0 || p.length > MAX_SELECTOR_LENGTH || !PATTERN_CHARSET.test(p)) {
      errors.push(`${where}.patterns contains an invalid pattern`);
      continue;
    }
    // Every brace section must be one of the fixed tokens.
    const braceSections = p.match(/\{[^}]*\}/g) ?? [];
    for (const section of braceSections) {
      if (!PATTERN_TOKENS.includes(section)) {
        errors.push(`${where}.patterns contains an unknown token ${section}`);
      }
    }
    if ((p.match(/\{/g) ?? []).length !== braceSections.length) {
      errors.push(`${where}.patterns contains an unbalanced brace`);
    }
  }
}

function validateAdapter(
  id: string,
  raw: unknown,
  manifestHosts: readonly string[],
): { config?: AdapterConfig; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { errors: ["adapter config must be an object"] };
  for (const key of Object.keys(raw)) {
    if (!(ADAPTER_KEYS as readonly string[]).includes(key)) errors.push(`unknown key ${key}`);
  }
  if (!isStringArray(raw.hosts) || raw.hosts.length === 0) {
    errors.push("hosts must be a non-empty array of strings");
  } else {
    for (const host of raw.hosts) {
      if (!HOST_CHARSET.test(host)) errors.push(`invalid host ${host}`);
      else if (!manifestHosts.includes(host)) {
        errors.push(`host ${host} is not covered by the manifest host permissions`);
      }
    }
  }
  if (!isStringArray(raw.pathPatterns) || raw.pathPatterns.length === 0) {
    errors.push("pathPatterns must be a non-empty array of strings");
  } else {
    for (const p of raw.pathPatterns) {
      if (!PATH_PREFIX_CHARSET.test(p)) errors.push(`invalid path pattern ${p}`);
    }
  }
  const anchors = raw.anchors;
  if (!isRecord(anchors)) {
    errors.push("anchors must be an object");
  } else {
    for (const key of Object.keys(anchors)) {
      if (!(ANCHOR_GROUP_KEYS as readonly string[]).includes(key)) errors.push(`unknown anchor group ${key}`);
    }
    for (const group of ["orderTotal", "bnplWidget"]) {
      const g = anchors[group];
      if (!isRecord(g)) errors.push(`${group} must be an object`);
      else validateSelectors(g.css, errors, `anchors.${group}`);
    }
    const installmentText = anchors.installmentText;
    if (!isRecord(installmentText)) errors.push("installmentText must be an object");
    else validatePatterns(installmentText.patterns, errors, "anchors.installmentText");
  }
  if (errors.length > 0) return { errors };
  return { config: raw as unknown as AdapterConfig, errors };
}

/**
 * Validates the bundled config against the closed schema and the manifest
 * host-permission list. Unknown schema versions and unknown top-level keys
 * fail the whole config; a per-adapter failure disables that adapter only.
 */
export function validateConfig(raw: unknown, manifestHosts: readonly string[]): ValidatedConfig {
  if (!isRecord(raw)) throw new Error("config must be an object");
  for (const key of Object.keys(raw)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      throw new Error(`config contains unknown top-level key ${key}`);
    }
  }
  if (raw.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new Error(`unsupported config schemaVersion ${String(raw.schemaVersion)}`);
  }
  if (typeof raw.engineMin !== "string") throw new Error("config engineMin must be a string");
  if (!isRecord(raw.adapters)) throw new Error("config adapters must be an object");

  const adapters = new Map<AdapterId, AdapterConfig>();
  const disabled: { id: string; errors: string[] }[] = [];
  for (const [id, adapterRaw] of Object.entries(raw.adapters)) {
    if (!KNOWN_ADAPTER_IDS.includes(id)) {
      disabled.push({ id, errors: ["unknown adapter id"] });
      continue;
    }
    const { config, errors } = validateAdapter(id, adapterRaw, manifestHosts);
    if (config) adapters.set(id as AdapterId, config);
    else disabled.push({ id, errors });
  }
  return { schemaVersion: CONFIG_SCHEMA_VERSION, adapters, disabled };
}
