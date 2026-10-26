import { NextResponse } from 'next/server'
import { getLlmStatus } from '@/lib/llm'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function GET() {
  const llm = getLlmStatus()
  return NextResponse.json(
    {
      success: true,
      data: {
        message: 'ok',
        // Diagnóstico do FinBot sem expor chaves nem hosts.
        finbot: { configured: llm.configured, model: llm.model },
      },
    },
    {
      status: 200,
      headers: corsHeaders,
    }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}
