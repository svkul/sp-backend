/**
 * Validates and normalizes a `returnTo` parameter to a safe absolute URL on the
 * frontend origin. Defends against open-redirect attacks (e.g. attacker passing
 * `returnTo=https://evil.com/phish` and hoping our `/auth/google/callback`
 * redirects the freshly-authenticated user to their site with cookies leaking).
 *
 * Accepted shapes:
 *   - Bare path: `/dashboard`, `/orders?id=1` → joined to frontendUrl.
 *   - Absolute URL on the frontend origin → returned as-is.
 *
 * Anything else (other host, protocol-relative `//evil.com`, bad path, etc.)
 * falls back to `frontendUrl` (the safe default).
 */
export function safeReturnTo(input: string | null | undefined, frontendUrl: string): string {
  const fallback = frontendUrl.replace(/\/+$/, '') || '/';
  if (!input) {
    return fallback;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }

  // Protocol-relative `//evil.com/...` is a classic open-redirect trap.
  if (trimmed.startsWith('//') || trimmed.startsWith('\\')) {
    return fallback;
  }

  if (trimmed.startsWith('/')) {
    try {
      const url = new URL(trimmed, frontendUrl);
      const allowed = new URL(frontendUrl);
      if (url.origin !== allowed.origin) {
        return fallback;
      }
      return url.toString();
    } catch {
      return fallback;
    }
  }

  try {
    const url = new URL(trimmed);
    const allowed = new URL(frontendUrl);
    if (url.origin !== allowed.origin) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}
