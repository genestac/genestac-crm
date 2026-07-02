import { fetchAPI } from '@/utils/api'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await fetchAPI('/api/templates')
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("DEBUG ERROR in templates GET:", error, error.cause, error.stack)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await fetchAPI('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
