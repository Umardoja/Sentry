import "server-only";

const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+01:00$/;
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(value: string) {
  const m = iso.exec(value);
  if (!m) throw new Error(`invalid Lagos ISO timestamp: ${value}`);
  return m;
}

/** Minutes since epoch, treating the Lagos wall clock as UTC (no machine time zone involved). */
export function toMinutes(value: string): number {
  const m = parts(value);
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) / 60000;
}

export function fromMinutes(total: number): string {
  const d = new Date(total * 60000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+01:00`;
}

/** Seconds since epoch on the same Lagos wall-clock basis as toMinutes. */
export function toSeconds(value: string): number {
  return toMinutes(value) * 60 + Number(parts(value)[6]);
}

export function fromSeconds(total: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fromMinutes(Math.floor(total / 60)).slice(0, 17)}${p(((total % 60) + 60) % 60)}+01:00`;
}

export function addSeconds(value: string, seconds: number): string {
  return fromSeconds(toSeconds(value) + seconds);
}

export function at(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00+01:00`;
}

export function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

export function addMinutes(value: string, minutes: number): string {
  return fromMinutes(toMinutes(value) + minutes);
}

export function dateOf(value: string): string {
  return value.slice(0, 10);
}

export function hhmmOf(value: string): string {
  return value.slice(11, 16);
}

export function minutesBetween(from: string, to: string): number {
  return toMinutes(to) - toMinutes(from);
}

export function addDays(date: string, n: number): string {
  return dateOf(addMinutes(`${date}T00:00:00+01:00`, n * 1440));
}

export function weekday(date: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!)).getUTCDay();
}

export function formatTime(value: string): string {
  return hhmmOf(parts(value)[0]);
}

export function formatFull(value: string): string {
  const m = parts(value);
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return `${days[d.getUTCDay()]} ${+m[3]!} ${months[d.getUTCMonth()]} ${m[1]} · ${m[4]}:${m[5]}`;
}

export function formatDay(date: string): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  return `${days[d.getUTCDay()]} ${+date.slice(8, 10)} ${months[d.getUTCMonth()]}`;
}
