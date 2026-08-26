/**
 * Hand-written type declarations for the plain-JS guard module
 * (marketing-host-guard.mjs). This file, like scripts/build.mjs, is
 * intentionally plain JavaScript, not TypeScript — scripts/ is not part
 * of tsconfig.json's compiled surface. This declaration exists solely so
 * tests/static/release-guard.test.ts (which IS type-checked) can import
 * it without `any` leaking into a checked test file.
 */

export interface GuardScanFile {
  readonly path: string;
  readonly text: string;
}

export interface GuardHit {
  readonly path: string;
  readonly match: string;
}

export const UNCONFIGURED_MARKETING_HOST_PATTERN: RegExp;

export function findUnconfiguredMarketingHostMatches(text: string): string[];

export function scanForUnconfiguredMarketingHost(files: readonly GuardScanFile[]): GuardHit[];

export function formatGuardFailureMessage(hits: readonly GuardHit[]): string;
