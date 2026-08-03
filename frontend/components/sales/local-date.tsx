'use client'

import { useEffect, useState } from 'react'

/**
 * LocalDate — renders a UTC ISO date string in the user's local browser timezone.
 * Renders nothing on the server to avoid hydration mismatches where the server
 * (running UTC) would show the wrong time vs. the user's local timezone (e.g. IST).
 * After the component mounts in the browser, it formats using the user's local timezone.
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

  const [formatted, setFormatted] = useState<string | null>(null)

  useEffect(() => {
    setFormatted(new Date(iso).toLocaleString([], options ?? defaultOptions))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso])

  // Render nothing until client-side hydration so the UTC server value
  // never shows to the user.
  if (formatted === null) return null

  return <span>{formatted}</span>
}
