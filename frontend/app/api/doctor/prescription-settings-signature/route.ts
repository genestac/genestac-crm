import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthToken } from '@/utils/cookie-helper'

export async function POST(request: NextRequest) {
  try {
    const API_BASE_URL =
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:8000'

    const cookieStore = await cookies()
    const token = getAuthToken(cookieStore.getAll())

    const body = await request.formData()

    const response = await fetch(
      `${API_BASE_URL}/api/doctor/prescription-settings/signature`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Cookie: cookieStore.toString(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
      },
    )

    const json = await response.json()
    return NextResponse.json(json, { status: response.status })
  } catch (error) {
    console.error('Signature upload proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
