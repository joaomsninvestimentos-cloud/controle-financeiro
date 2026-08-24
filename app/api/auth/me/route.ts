import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { COOKIE_NAME } from '@/lib/session'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx.authorized) {
    return NextResponse.json({ authorized: false }, { status: 401 })
  }
  return NextResponse.json({ authorized: true, user: ctx.user })
}

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
