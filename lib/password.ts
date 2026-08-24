import 'server-only'

/** PBKDF2-based password hashing — compatible with Web Crypto (Edge/Workers) */

async function importKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = Buffer.from(salt).toString('hex')
  const key = await importKey(password)
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200_000 },
    key,
    256
  )
  const hashHex = Buffer.from(bits).toString('hex')
  return `pbkdf2:sha256:200000:${saltHex}:${hashHex}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, , iterStr, saltHex, hashHex] = stored.split(':')
    const salt = Buffer.from(saltHex, 'hex')
    const iterations = parseInt(iterStr, 10)
    const key = await importKey(password)
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      256
    )
    const candidate = Buffer.from(bits).toString('hex')
    // Constant-time comparison
    if (candidate.length !== hashHex.length) return false
    let diff = 0
    for (let i = 0; i < candidate.length; i++) {
      diff |= candidate.charCodeAt(i) ^ hashHex.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}
