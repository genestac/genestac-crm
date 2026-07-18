import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthToken } from '@/utils/cookie-helper'

const API_BASE_URL =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:8000'

async function getHeaders() {
  const cookieStore = await cookies()
  const token = getAuthToken(cookieStore.getAll())
  return {
    Cookie: cookieStore.toString(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function GET() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/doctor/prescription-settings`,
      { cache: 'no-store', headers: await getHeaders() },
    )
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('prescription-settings GET error:', error)
    return NextResponse.json({}, { status: 200 }) // return empty object on error so UI still loads
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const response = await fetch(
      `${API_BASE_URL}/api/doctor/prescription-settings`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(await getHeaders()),
        },
        body: JSON.stringify(body),
      },
    )
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('prescription-settings POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
