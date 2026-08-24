import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'fallback-dev-secret-change-in-production'
)
const ALGORITHM = 'HS256'
const COOKIE_NAME = 'session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET)
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: [ALGORITHM] })
    if (typeof payload.sub !== 'string') return null
    return payload.sub
  } catch {
    return null
  }
}

export { COOKIE_NAME, MAX_AGE }
