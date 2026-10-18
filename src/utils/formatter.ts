/**
 * Format helpers for WhatsApp message styling
 */

export function bold(text: string): string {
  return `*${text}*`;
}

export function italic(text: string): string {
  return `_${text}_`;
}

export function monospace(text: string): string {
  return `\`\`\`${text}\`\`\``;
}

export function quote(text: string): string {
  return text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');
}

/**
 * Format timestamp to human readable local time string (WIB)
 */
export function formatTime(date: Date | number, timezone: string = 'Asia/Jakarta'): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleString('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDate(date: Date | number, timezone: string = 'Asia/Jakarta'): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
