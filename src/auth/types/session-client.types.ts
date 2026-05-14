export const SESSION_CLIENTS = ['web', 'ios', 'android'] as const;

export type SessionClient = (typeof SESSION_CLIENTS)[number];

export function isSessionClient(value: string): value is SessionClient {
  return (SESSION_CLIENTS as readonly string[]).includes(value);
}

/** Map device `platform` (OAuth / mobile) to persisted session client. */
export function mapPlatformToSessionClient(platform?: string | null): SessionClient {
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
}
