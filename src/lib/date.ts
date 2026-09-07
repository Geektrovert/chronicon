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
