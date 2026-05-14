import type { Request } from 'express';

function headerToString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    return typeof first === 'string' ? first.trim() || undefined : undefined;
  }

  return undefined;
}

/**
 * Client IP behind Cloudflare / reverse proxies.
 * Prefer CF-Connecting-IP (set by Cloudflare), then first X-Forwarded-For hop.
 */
export function getClientIp(req: Request): string | undefined {
  const cfIp = headerToString(req.headers['cf-connecting-ip']);
  if (cfIp) {
    return cfIp;
  }

  const xff = headerToString(req.headers['x-forwarded-for']);
  if (xff) {
    const first = xff.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return req.socket.remoteAddress;
}
