import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schemas/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from '@/lib/password'
import { createSessionToken, COOKIE_NAME, MAX_AGE } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const INVALID = { error: 'INVALID_CREDENTIALS' }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })
    }

    const { email, password } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)

    // Same response for unknown account and wrong password
    if (!user || !user.passwordHash) {
      return NextResponse.json(INVALID, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(INVALID, { status: 401 })
    }

    const token = await createSessionToken(user.id)
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
