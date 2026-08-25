/**
 * The one place the bundled adapters.config.json is validated and made
 * available to the engine. Adapters read their own entry from here rather
 * than importing the raw JSON directly, so "config fails validation ->
 * adapter disabled entirely" (D6 §C.2) is enforced structurally: an adapter
 * with no validated entry has nothing to match against and reports
 * `matched: false` (src/engine/adapters/*.ts), never a partially-trusted
 * fallback selector set.
 *
 * No remote fetch anywhere in this module or its callers -- the config is a
 * bundled JSON import, resolved at build time.
 */
import bundledConfigJson from "./adapters.config.json";
import manifest from "../manifest.json";
import { validateConfig, type ValidatedConfig } from "./loader";

const MANIFEST_HOSTS: readonly string[] = manifest.host_permissions.map((pattern) =>
  pattern.replace(/^https:\/\//, "").replace(/\/\*$/, ""),
);

export const BUNDLED_CONFIG: ValidatedConfig = validateConfig(bundledConfigJson, MANIFEST_HOSTS);
