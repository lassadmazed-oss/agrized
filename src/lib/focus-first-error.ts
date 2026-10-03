/**
 * Take the visitor to the answer that is wrong (owner, 2026-10-03: «if there is any wrong answer or missing,
 * direct him to it»).
 *
 * Two forms already did half of this and four did none, each in its own way. This is the one helper all of
 * them call, so a form cannot quietly stop doing it.
 *
 * What it adds over the old inline version: the field is SCROLLED to the middle of the screen before it is
 * focused. `focus()` alone scrolls only when the element is off-screen, and it jumps — on a phone, where the
 * keyboard covers the bottom half, a field focused just above the fold is a field the visitor never sees.
 *
 * The first `[aria-invalid="true"]` or `[data-error-anchor]` IN DOM ORDER wins, which is the first thing wrong
 * reading down the page: the visitor is sent to the top of their problem, not the bottom of it.
 */
export function focusFirstError(root: ParentNode = document) {
  // setTimeout, not requestAnimationFrame: this has to run after React commits even in a background tab,
  // where rAF never fires.
  setTimeout(() => {
    const field = root.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-anchor]');
    if (!field) return;

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    try {
      field.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    } catch {
      // Older engines reject the options object; the focus below still brings the field into view.
    }

    // preventScroll so the browser does not undo the centring with a jump of its own.
    field.focus({ preventScroll: true });
  }, 0);
}
