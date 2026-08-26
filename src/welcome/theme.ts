/**
 * The welcome tab is the same onboarding panel as the popup
 * (src/popup/theme.ts's POPUP_CSS, which this page also loads), just
 * hosted on a full page instead of a 340px-wide toolbar popup. This file
 * adds only page-level centering on top of that shared stylesheet — no
 * new colour, spacing, or component tokens are introduced here.
 */
export const WELCOME_CSS = `
body {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
/* D5 (first-run UX spec, §6): narrower body padding at narrow viewports,
   alongside the .onboard/.panel max-width: 100% fix in popup/theme.ts --
   together they keep the panel inside the viewport at 375px with no
   horizontal scrollbar. */
@media (max-width: 420px) {
  body { padding: 16px; }
}
`;
