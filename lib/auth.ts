import 'server-only'
import { cookies } from 'next/headers'
import { verifySessionToken, COOKIE_NAME } from './session'
import { db } from '@/db'
import { users } from '@/db/schemas/schema'
import { eq } from 'drizzle-orm'

export type AuthContext =
  | { authorized: true; user: { id: string; name: string; email: string } }
  | { authorized: false }

export async function getAuthContext(): Promise<AuthContext> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return { authorized: false }

    const userId = await verifySessionToken(token)
    if (!userId) return { authorized: false }

    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) return { authorized: false }
    return { authorized: true, user }
  } catch {
    return { authorized: false }
  }
}

export async function requireAuth(): Promise<{ id: string; name: string; email: string }> {
  const ctx = await getAuthContext()
  if (!ctx.authorized) {
    throw new Error('UNAUTHORIZED')
  }
  return ctx.user
}
