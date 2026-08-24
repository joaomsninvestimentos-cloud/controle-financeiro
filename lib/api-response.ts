export type ApiSuccess<T> = {
  success: true
  data: T
  error?: never
}

export type ApiFailure = {
  success: false
  data?: never
  error: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
