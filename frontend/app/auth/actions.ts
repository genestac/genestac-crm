'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)

  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Login failed' }))
    redirect('/auth?error=' + encodeURIComponent(errorData.detail || 'Login failed'))
  }

  // Forward the cookie set by FastAPI to Next.js
  const setCookieHeader = res.headers.get('set-cookie')
  if (setCookieHeader) {
    // Basic parser for the access_token cookie
    const tokenMatch = setCookieHeader.match(/access_token=([^;]+)/)
    if (tokenMatch) {
      const cookieStore = await cookies()
      cookieStore.set('access_token', tokenMatch[1], { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      })
    }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function logout() {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value
  
  if (token) {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': `access_token=${token}`
      }
    }).catch(() => {}) // Ignore errors on logout
  }
  
  cookieStore.delete('access_token')
  redirect('/auth')
}
