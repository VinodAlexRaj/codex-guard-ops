import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the local date as YYYY-MM-DD string.
 * Avoids timezone issues with toISOString() which returns UTC.
 * For Malaysia (UTC+8), toISOString() at 8am local would return previous day's date.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats a YYYY-MM-DD date string to locale-formatted date.
 * Parses date parts directly to avoid UTC timezone conversion issues.
 * @param dateStr - Date string in YYYY-MM-DD format from Supabase
 * @param options - Optional Intl.DateTimeFormatOptions
 * @returns Formatted date string (e.g., "9 Apr 2026")
 */
export function formatLocalDate(
  dateStr: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateStr) return ''
  // Parse date parts directly to avoid UTC conversion
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day) // Local time, no UTC shift
  return date.toLocaleDateString('en-MY', options || {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const headerDateFormatter = new Intl.DateTimeFormat('en-MY', {
  weekday: 'short',
  month: 'short',
  day: '2-digit',
  year: 'numeric',
})

const compactDateFormatter = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatHeaderDate(date: Date = new Date()): string {
  return headerDateFormatter.format(date)
}

export function formatCompactDate(date: Date): string {
  return compactDateFormatter.format(date)
}
