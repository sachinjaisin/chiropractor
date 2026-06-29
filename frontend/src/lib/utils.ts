import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function getApiError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { data?: { message?: string; code?: string } } }).response
    return r?.data?.message ?? r?.data?.code ?? 'An unexpected error occurred'
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}
