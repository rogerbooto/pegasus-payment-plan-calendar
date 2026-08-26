/**
 * Hand-written type declarations for the plain-JS route-table module
 * (fixture-routes.mjs). scripts/ is not part of tsconfig.json's compiled
 * surface -- this exists solely so type-checked test files can import it
 * without `any` leaking in.
 */

export interface FixtureRoute {
  readonly path: string;
  readonly file: string;
  readonly label: string;
  readonly describes: string;
  readonly pairedTest: string;
}

export const FIXTURE_ROUTES: readonly FixtureRoute[];
