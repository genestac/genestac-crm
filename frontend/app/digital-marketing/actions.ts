'use server'

import { revalidatePath } from 'next/cache'
import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'

// ─── Blog Types ────────────────────────────────────────────────────────────────

export type BlogStatus = 'draft' | 'published' | 'scheduled'

export interface Blog {
  id: string
  title: string
  slug: string
  content_layout: ContentBlock[]
  status: BlogStatus
  published_at: string | null
  author_id: string | null
  meta_title: string | null
  meta_description: string | null
  focus_keywords: string[] | null
  og_image: string | null
  canonical_url: string | null
  faqs: { question: string, answer: string }[] | null
  dynamic_schema_json: object | null
  created_at: string
  updated_at: string
}

export interface ContentBlock {
  id: string
  type: 'heading' | 'text' | 'image' | 'video' | 'cta'
  data: Record<string, unknown>
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

export async function getBlogs(status?: string): Promise<{ blogs: Blog[]; total: number }> {
  try {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetchAPI(`/api/admin/blogs/${qs}`)
    return res
  } catch {
    return { blogs: [], total: 0 }
  }
}

export async function getBlog(id: string): Promise<Blog | null> {
  try {
    const res = await fetchAPI(`/api/admin/blogs/${id}`)
    return res.blog ?? null
  } catch {
    return null
  }
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export async function saveBlog(formData: FormData) {
  const id = formData.get('id') as string | null

  if (id) {
    // Update
    await fetchAPI(`/api/admin/blogs/${id}`, {
      method: 'PUT',
      body: formData,
    })
  } else {
    // Create
    await fetchAPI('/api/admin/blogs/', {
      method: 'POST',
      body: formData,
    })
  }

  revalidatePath('/digital-marketing/blogs')
}

export async function publishBlog(id: string): Promise<{ success: boolean; schema?: object }> {
  try {
    const res = await fetchAPI(`/api/admin/blogs/${id}/publish`, {
      method: 'POST',
    })
    revalidatePath('/digital-marketing/blogs')
    return { success: true, schema: res.schema }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Publish failed'
    throw new Error(msg)
  }
}

export async function deleteBlog(id: string) {
  await fetchAPI(`/api/admin/blogs/${id}`, { method: 'DELETE' })
  revalidatePath('/digital-marketing/blogs')
}

// ─── Image upload ──────────────────────────────────────────────────────────────

export async function uploadBlogImage(formData: FormData): Promise<{ url: string }> {
  const cookieStore = await cookies()
  const token = cookieStore.get('access_token')?.value

  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000'
  const res = await fetch(`${API_BASE_URL}/api/admin/blogs/upload-image`, {
    method: 'POST',
    headers: token
      ? { Cookie: `access_token=${token}`, Authorization: `Bearer ${token}` }
      : {},
    body: formData,
  })
  if (!res.ok) throw new Error('Image upload failed')
  const data = await res.json()
  return { url: data.url }
}

// ─── Stats for dashboard overview ─────────────────────────────────────────────

export async function getBlogStats() {
  try {
    const [all, published, drafts, scheduled] = await Promise.all([
      fetchAPI('/api/admin/blogs/'),
      fetchAPI('/api/admin/blogs/?status=published'),
      fetchAPI('/api/admin/blogs/?status=draft'),
      fetchAPI('/api/admin/blogs/?status=scheduled'),
    ])
    return {
      total: all.total ?? 0,
      published: published.total ?? 0,
      drafts: drafts.total ?? 0,
      scheduled: scheduled.total ?? 0,
    }
  } catch {
    return { total: 0, published: 0, drafts: 0, scheduled: 0 }
  }
}
