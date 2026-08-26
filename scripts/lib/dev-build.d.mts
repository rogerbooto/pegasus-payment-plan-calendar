/**
 * Hand-written type declarations for the plain-JS derivation module
 * (dev-build.mjs). scripts/ is not part of tsconfig.json's compiled
 * surface (see scripts/build.mjs and marketing-host-guard.mjs's own
 * .d.mts for the same pattern) -- this exists solely so type-checked test
 * files can import it without `any` leaking in.
 */

export const DEV_HOST_PATTERN_HTTP: string;
export const DEV_HOST_PATTERN_HTTPS: string;
export const DEV_ADAPTER_HOST: string;
export const DEV_ADAPTER_PATH_PREFIX: string;

export function deriveDevManifest(manifest: Record<string, unknown>): Record<string, unknown>;

export function deriveDevAdaptersConfig(config: Record<string, unknown>): Record<string, unknown>;
