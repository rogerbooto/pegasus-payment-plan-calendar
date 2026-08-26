/**
 * Hand-written type declarations for the plain-JS shared-port module
 * (fixture-port.mjs). See dev-build.d.mts / marketing-host-guard.d.mts
 * for the same pattern.
 */

export const DEFAULT_FIXTURE_PORT: number;
export const HTTP_DEFAULT_PORT: number;

export function resolveFixturePort(env?: Record<string, string | undefined>): number;

export function canReachAdapterMatchedFixture(port: number): boolean;

export function describeFixturePortMismatch(expectedPort: number, actualPort: number): string | null;
