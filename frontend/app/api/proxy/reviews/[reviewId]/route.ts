import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const { reviewId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value

  const body = await req.json()

  const res = await fetch(`${API_BASE_URL}/api/admin/reviews/${reviewId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.detail || 'Update failed' }, { status: res.status })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const { reviewId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value

  const res = await fetch(`${API_BASE_URL}/api/admin/reviews/${reviewId}`, {
    method: 'DELETE',
    headers: token
      ? { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` }
      : {},
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.detail || 'Delete failed' }, { status: res.status })
  }
  return NextResponse.json(data)
}
