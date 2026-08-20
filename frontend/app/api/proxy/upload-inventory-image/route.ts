import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value

  const formData = await req.formData()
  formData.append('folder', 'inventory')

  const res = await fetch(`${API_BASE_URL}/api/admin/blogs/upload-image`, {
    method: 'POST',
    headers: token
      ? { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` }
      : {},
    body: formData,
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.detail || 'Upload failed' }, { status: res.status })
  }

  return NextResponse.json(data)
}
