import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8000'

/** POST /api/proxy/exercises/upload-thumbnail — upload thumbnail image to Cloudinary via backend */
export async function POST(req: NextRequest) {
  const store = await cookies()
  const token = store.get('access_token')?.value

  const formData = await req.formData()

  const upstream = await fetch(`${API_BASE}/api/admin/exercises/upload-thumbnail`, {
    method: 'POST',
    headers: token
      ? { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` }
      : {},
    body: formData,
  })

  const data = await upstream.json().catch(() => ({ error: 'Upload failed' }))
  return NextResponse.json(data, { status: upstream.status })
}
