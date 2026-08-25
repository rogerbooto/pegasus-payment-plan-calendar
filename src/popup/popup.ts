/**
 * Toolbar popup entry point. This surface will host:
 * - the genuineness affordance (src/overlay/ToolbarVerification.ts);
 * - the on-this-site / everywhere / measurement toggles;
 * - the per-origin "Enable on this store" opt-in flow for checkouts running
 *   on a merchant's own domain (see docs/permissions.md).
 */

/**
 * The ONLY chrome.permissions.request call site in the codebase, invoked
 * exclusively from a user gesture on the "Enable on this store" control.
 * Before offering the persistent grant, the implementing task must probe
 * the checkout fingerprint via the activeTab grant; a page that does not
 * fingerprint as a supported checkout gets no request at all.
 */
export async function onEnableThisStoreClick(originPattern: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [originPattern] });
}
