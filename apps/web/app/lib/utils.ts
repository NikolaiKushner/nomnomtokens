import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The `cn` helper, same contract as shadcn's: merge conditional classes and let
 * a later utility win over an earlier one in the same Tailwind group. Every
 * component below accepts a `class` prop and funnels it through this, which is
 * what makes them composable without variant sprawl.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
