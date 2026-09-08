import { DateTime, Option } from "effect";

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions & { locale?: string } = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  },
) {
  return Option.match(DateTime.make(value), {
    onNone: () => "Unknown date",
    onSome: (date) => DateTime.formatUtc(date, { ...options, locale: options.locale ?? "en" }),
  });
}

export function formatRelativeDate(value: string, now: DateTime.Utc | undefined) {
  if (!now) return formatDate(value, { month: "short", day: "numeric" });
  return Option.match(DateTime.make(value), {
    onNone: () => "Unknown date",
    onSome: (date) => {
      const minutes = Math.max(
        0,
        Math.floor((DateTime.toEpochMillis(now) - DateTime.toEpochMillis(date)) / 60_000),
      );
      if (minutes < 1) return "now";
      if (minutes < 60) return `${minutes}m`;
      if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
      if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
      return formatDate(value, { month: "short", day: "numeric" });
    },
  });
}

export function formatTimestamp(value: string) {
  return Option.match(DateTime.make(value), {
    onNone: () => "Unknown date",
    onSome: (date) => `${DateTime.formatIso(date).slice(0, 16).replace("T", " ")} UTC`,
  });
}
