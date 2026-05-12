type DurationUnit = 's' | 'm' | 'h' | 'd';

const UNIT_TO_MS: Record<DurationUnit, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse duration string like "15m", "7d", "30s", "2h" to milliseconds.
 */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());

  if (!match) {
    throw new Error(`Invalid duration format: "${value}". Expected e.g. "15m", "7d".`);
  }

  const num = Number(match[1]);
  const unit = match[2] as DurationUnit;
  return num * UNIT_TO_MS[unit];
}
