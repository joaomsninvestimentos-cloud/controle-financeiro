import 'server-only'

import { NextResponse } from 'next/server'

import type { ApiFailure } from './api-response'
import { AppError } from './errors'

export function handleApiError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    )
  }

  console.error('[API ERROR]', error)
  return NextResponse.json(
    {
      success: false,
      error: 'Internal server error',
    },
    { status: 500 }
  )
}
