function twoDigits(value: number): string {
  return `${value}`.padStart(2, '0');
}

export const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const observationFormatters = new Map<string | undefined, Intl.DateTimeFormat>();

export function formatObservationTime(timestamp: number, timeZone?: string): string {
  let formatter = observationFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    observationFormatters.set(timeZone, formatter);
  }
  return formatter.format(timestamp);
}

export function shanghaiTonight(timestamp: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHANGHAI_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(timestamp);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  const tonight = new Date(0);
  tonight.setUTCFullYear(year, month - 1, day);
  tonight.setUTCHours(14);
  return tonight.getTime();
}

function deviceClock(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/** Device timezone offset at the rendered instant, including daylight saving. */
function utcOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `UTC${minutes < 0 ? '-' : '+'}${hours}${remainder ? `:${twoDigits(remainder)}` : ''}`;
}

/** Format the rendered instant in the browser's system timezone. */
export function formatSkyTime(timestamp: number): string {
  const date = new Date(timestamp);
  const calendar = date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  return `${calendar} ${deviceClock(date)} ${utcOffset(date)}`;
}

/** Compact variant for narrow footers: abbreviated month, same clock. */
export function formatSkyTimeShort(timestamp: number): string {
  const date = new Date(timestamp);
  const calendar = date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  return `${calendar} ${deviceClock(date)} ${utcOffset(date)}`;
}

/** Month, day, clock and UTC offset for mobile footers. */
export function formatSkyTimeCompact(timestamp: number): string {
  const date = new Date(timestamp);
  const calendar = `${twoDigits(date.getMonth() + 1)}/${twoDigits(date.getDate())}`;
  return `${calendar} ${deviceClock(date)} ${utcOffset(date)}`;
}
