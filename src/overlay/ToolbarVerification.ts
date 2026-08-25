/**
 * The toolbar popup is the ONLY genuineness affordance: a page can draw a
 * pixel-perfect copy of the in-page overlay, but it cannot draw inside the
 * browser toolbar. No verification claim (checkmark, lock, "verified")
 * appears in the in-page panel — genuineness language is allowed in this
 * module and nowhere else.
 */
import { NotImplementedError } from "../shared/errors";

export function renderToolbarVerification(_container: HTMLElement): void {
  throw new NotImplementedError("overlay/ToolbarVerification#renderToolbarVerification");
}
