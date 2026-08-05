'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { clearAuthCookies } from '@/utils/cookie-helper'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)

  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    })
  } catch (err: any) {
    console.error("Login connection error:", err)
    redirect('/auth?error=' + encodeURIComponent(`Cannot connect to backend server at ${API_BASE_URL}. Verify the server is running and accessible.`))
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Login failed' }))
    redirect('/auth?error=' + encodeURIComponent(errorData.detail || 'Login failed'))
  }

  // Extract access token from response body or set-cookie headers
  const text = await res.text().catch(() => '')
  let data: any = {}
  try {
    data = JSON.parse(text)
  } catch (e) {
    // It's not JSON! (Probably HTML from a redirect or Nginx welcome page)
    console.error("Failed to parse JSON. Raw response:", text.substring(0, 200))
  }
  let token = data?.access_token

  if (!token) {
    // Fallback: parse access_token from Set-Cookie header
    const setCookieHeader = res.headers.get('set-cookie')
    if (setCookieHeader) {
      const tokenMatch = setCookieHeader.match(/access_token=([^;]+)/)
      if (tokenMatch) {
        token = tokenMatch[1]
      }
    }
  }

  if (token) {
    const isProd = process.env.NODE_ENV === 'production' && !API_BASE_URL.includes('localhost') && !API_BASE_URL.includes('127.0.0.1');
    const cookieStore = await cookies()
    cookieStore.set('access_token', token, { 
      httpOnly: true, 
      secure: isProd, // Enforce HTTPS in prod
      sameSite: 'lax',
      ...(isProd ? { domain: '.genestac.com' } : {}), // Share cookie across subdomains in prod
      path: '/'
    })
  } else {
    let errorMsg = 'Login failed: Authentication token could not be retrieved.'
    if (text && !text.includes('access_token')) {
      errorMsg += ` Raw response preview: ${text.substring(0, 100)}`
    }
    redirect('/auth?error=' + encodeURIComponent(errorMsg))
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
  
  clearAuthCookies(cookieStore)
  revalidatePath('/', 'layout')
  redirect('/auth')
}
