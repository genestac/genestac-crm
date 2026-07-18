import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthToken } from '@/utils/cookie-helper'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const API_BASE_URL =
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:8000'

    const cookieStore = await cookies()
    const token = getAuthToken(cookieStore.getAll())

    const response = await fetch(
      `${API_BASE_URL}/api/doctor/prescriptions/${id}/pdf`,
      {
        cache: 'no-store',
        headers: {
          Cookie: cookieStore.toString(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to generate PDF' },
        { status: response.status },
      )
    }

    const pdf = await response.arrayBuffer()
    const contentDisposition = response.headers.get('content-disposition')

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          contentDisposition ||
          `attachment; filename="Prescription_${id.substring(0, 8)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Prescription PDF proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
