'use client'

/**
 * LocalDate — renders a UTC ISO date string in the user's local browser timezone.
 * Use this instead of calling toLocaleString() in server components, which would
 * format the date in the server's timezone (UTC) rather than the user's timezone.
 */
export function LocalDate({
  iso,
  options,
}: {
  iso: string
  options?: Intl.DateTimeFormatOptions
}) {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }

  return (
    <span suppressHydrationWarning>
      {new Date(iso).toLocaleString([], options ?? defaultOptions)}
    </span>
  )
}
