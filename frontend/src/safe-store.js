// Browser storage that never throws. In some privacy settings and modes, touching local storage throws instead of
// working (a SecurityError, or a quota error on a full or private-mode store), and a throw at the wrong moment would
// stop the whole page. Nothing stored here is needed to make or join a table: it only restores your name and your last
// table. So when storage is unavailable the page simply does not remember, and carries on.
// getStorage is a function so Node tests can supply a broken one; it is called each time, because even reading
// the `localStorage` property can be what throws.
export function makeSafeStore(getStorage = () => globalThis.localStorage) {
  return {
    // The stored text, or null if there is none or storage is unavailable.
    get(key) { try { return getStorage().getItem(key) ?? null; } catch { return null; } },
    // True if the value was stored.
    set(key, value) { try { getStorage().setItem(key, String(value)); return true; } catch { return false; } },
    // True if storage was reachable.
    remove(key) { try { getStorage().removeItem(key); return true; } catch { return false; } },
  };
}
