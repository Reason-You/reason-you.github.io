/** Format the rendered instant in the browser's system timezone. */
export function formatSkyTime(timestamp: number): string {
  const date = new Date(timestamp);
  const calendar = date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const clock = date.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return `${calendar} · ${clock} · Facing South`;
}

/** Compact variant for narrow footers: abbreviated month, same clock. */
export function formatSkyTimeShort(timestamp: number): string {
  const date = new Date(timestamp);
  const calendar = date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const clock = date.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return `${calendar} · ${clock} · Facing South`;
}
