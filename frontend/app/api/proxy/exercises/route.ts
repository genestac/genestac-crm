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

/**
 * GET  /api/proxy/exercises?page=1&limit=20&category=yoga&...
 * GET  /api/proxy/exercises?endpoint=stats
 * GET  /api/proxy/exercises?endpoint={id}
 */
export async function GET(req: NextRequest) {
  const token = await getToken()
  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get('endpoint') // 'stats' | '<uuid>'
  const page = searchParams.get('page') ?? '1'
  const limit = searchParams.get('limit') ?? '20'
  const category = searchParams.get('category') ?? ''
  const type = searchParams.get('type') ?? ''
  const difficulty = searchParams.get('difficulty') ?? ''
  const isActive = searchParams.get('is_active') ?? ''
  const search = searchParams.get('search') ?? ''

  let upstreamUrl: string

  if (endpoint === 'stats') {
    upstreamUrl = `${API_BASE}/api/admin/exercises/stats`
  } else if (endpoint) {
    // Single exercise by ID
    upstreamUrl = `${API_BASE}/api/admin/exercises/${endpoint}`
  } else {
    // List with filters
    const params = new URLSearchParams({ page, limit })
    if (category) params.set('category', category)
    if (type) params.set('type', type)
    if (difficulty) params.set('difficulty', difficulty)
    if (isActive) params.set('is_active', isActive)
    if (search) params.set('search', search)
    upstreamUrl = `${API_BASE}/api/admin/exercises/?${params.toString()}`
  }

  const upstream = await fetch(upstreamUrl, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
  })
  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json(data, { status: upstream.status })
}

/**
 * POST /api/proxy/exercises        — create exercise (JSON body)
 */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const body = await req.json().catch(() => ({}))

  const upstream = await fetch(`${API_BASE}/api/admin/exercises/`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json(data, { status: upstream.status })
}

/**
 * PUT /api/proxy/exercises?id=<uuid>  — update exercise
 */
export async function PUT(req: NextRequest) {
  const token = await getToken()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  const upstream = await fetch(`${API_BASE}/api/admin/exercises/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json(data, { status: upstream.status })
}

/**
 * DELETE /api/proxy/exercises?id=<uuid>  — delete exercise
 */
export async function DELETE(req: NextRequest) {
  const token = await getToken()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const upstream = await fetch(`${API_BASE}/api/admin/exercises/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
  })
  const data = await upstream.json().catch(() => ({}))
  return NextResponse.json(data, { status: upstream.status })
}
