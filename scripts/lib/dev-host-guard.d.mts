/**
 * Hand-written type declarations for the plain-JS guard module
 * (dev-host-guard.mjs). See marketing-host-guard.d.mts for the pattern
 * this mirrors.
 */

export interface GuardScanFile {
  readonly path: string;
  readonly text: string;
}

export interface DevHostGuardHit {
  readonly path: string;
  readonly match: string;
}

export interface DevOnlyHostPattern {
  readonly label: string;
  readonly pattern: RegExp;
}

export const DEV_ONLY_HOST_PATTERNS: readonly DevOnlyHostPattern[];

export function findDevOnlyHostMatches(text: string): string[];

export function scanForDevOnlyHosts(files: readonly GuardScanFile[]): DevHostGuardHit[];

export function formatDevHostGuardFailureMessage(hits: readonly DevHostGuardHit[]): string;
