export function cacheSessionValue(key: string, value: unknown, storage?: Pick<Storage, "setItem" | "removeItem">): void {
  try {
    const target = storage ?? window.sessionStorage;
    if (value === null) target.removeItem(key);
    else target.setItem(key, JSON.stringify(value));
  } catch {
    try {
      (storage ?? window.sessionStorage).removeItem(key);
    } catch {}
  }
}