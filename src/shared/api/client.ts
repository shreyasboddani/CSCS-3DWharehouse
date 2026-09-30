const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly responseBody: string

  constructor(message: string, status: number, responseBody: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.responseBody = responseBody
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cleanPath = path.replace(/^\//, '')
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const response = await fetch(`${API_BASE_URL}/${cleanPath}`, { ...init, headers })
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, await response.text())
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
