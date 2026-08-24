import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schemas/schema'
import { eq } from 'drizzle-orm'
import { hashPassword } from '@/lib/password'
import { createSessionToken, COOKIE_NAME, MAX_AGE } from '@/lib/session'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_INPUT', details: parsed.error.flatten() }, { status: 400 })
    }

    const { name, email, password } = parsed.data
    const normalizedEmail = email.toLowerCase().trim()

    // Check duplicate
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: 'ACCOUNT_ALREADY_EXISTS' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const id = crypto.randomUUID()
    const now = new Date()

    await db.insert(users).values({
      id,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    const token = await createSessionToken(id)
    const res = NextResponse.json({ user: { id, name: name.trim(), email: normalizedEmail } })
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
