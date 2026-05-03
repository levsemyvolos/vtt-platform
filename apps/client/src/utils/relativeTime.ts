/**
 * Formats a date string as a relative time string using Intl.RelativeTimeFormat.
 * Returns a human-friendly string like "2 days ago", "just now", "3 hours ago".
 *
 * @param isoString ISO 8601 date string
 * @param locale   BCP-47 locale tag (e.g. 'uk', 'en')
 * @returns formatted relative time string
 */
export function formatRelativeTime(isoString: string, locale = 'uk'): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const nowMs = Date.now();
  const diffMs = date.getTime() - nowMs;
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absSec < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month');
  const diffYear = Math.round(diffMonth / 12);
  return rtf.format(diffYear, 'year');
}
