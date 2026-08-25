import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000'

async function getToken() {
  const store = await cookies()
  return store.get('access_token')?.value
}

function authHeaders(token?: string): Record<string, string> {
  if (!token) return {}
  return { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` }
}

/** GET /api/proxy/push-notifications?endpoint=stats|history|users|analytics */
export async function GET(req: NextRequest) {
  const token = await getToken()
  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get('endpoint') ?? 'stats'

  const allowed = ['stats', 'history', 'users', 'analytics']
  if (!allowed.includes(endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
  }

  const upstream = await fetch(
    `${API_BASE}/api/admin/push-notifications/${endpoint}`,
    { headers: { ...authHeaders(token), 'Content-Type': 'application/json' } }
  )

  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json(data, { status: upstream.status })
}

/** POST /api/proxy/push-notifications?endpoint=send|track-open */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get('endpoint') ?? 'send'

  const allowed = ['send', 'track-open']
  if (!allowed.includes(endpoint)) {
    return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))

  const upstream = await fetch(
    `${API_BASE}/api/admin/push-notifications/${endpoint}`,
    {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json(data, { status: upstream.status })
}
