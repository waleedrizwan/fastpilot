// Injected into the page (must stay self-contained, see snapshot.ts).

/**
 * Resolves once the DOM has gone `quietMs` without mutations, or after `maxMs`, or when the page is
 * left. A page that goes into the back/forward cache is frozen rather than destroyed, so without the
 * pagehide exit its timers never fire and the executeScript call waiting on this never returns.
 */
export function domQuiet(quietMs: number, maxMs: number): Promise<number> {
  const start = performance.now();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      obs.disconnect();
      clearTimeout(timer);
      clearTimeout(cap);
      removeEventListener('pagehide', finish);
      resolve(Math.round(performance.now() - start));
    };
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(finish, quietMs);
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout(finish, quietMs);
    const cap = setTimeout(finish, maxMs);
    addEventListener('pagehide', finish);
  });
}
