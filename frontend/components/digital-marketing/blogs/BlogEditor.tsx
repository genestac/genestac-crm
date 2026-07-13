'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Save, Globe, Eye, ArrowLeft, Loader2, Sparkles,
} from 'lucide-react'
import { BlockCanvas } from './BlockCanvas'
import { SEOPanel, type SEOData } from './SEOPanel'
import type { ContentBlock } from './types'
import { saveBlog, publishBlog } from '@/app/digital-marketing/actions'
import type { Blog } from '@/app/digital-marketing/actions'

interface Props {
  initialBlog?: Blog | null
}

const EMPTY_SEO: SEOData = {
  title: '',
  slug: '',
  metaTitle: '',
  metaDescription: '',
  focusKeywords: '',
  ogImage: '',
  canonicalUrl: '',
  status: 'draft',
  publishedAt: '',
  faqs: [],
}

export function BlogEditor({ initialBlog }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPublishing, setIsPublishing] = useState(false)

  const [blocks, setBlocks] = useState<ContentBlock[]>(
    ((initialBlog?.content_layout as unknown) as ContentBlock[]) ?? []
  )

  const [seo, setSEO] = useState<SEOData>(() => ({
    title: initialBlog?.title ?? '',
    slug:  initialBlog?.slug  ?? '',
    metaTitle:        initialBlog?.meta_title        ?? '',
    metaDescription:  initialBlog?.meta_description  ?? '',
    focusKeywords:    (initialBlog?.focus_keywords ?? []).join(', '),
    ogImage:          initialBlog?.og_image          ?? '',
    canonicalUrl:     initialBlog?.canonical_url     ?? '',
    status:           (initialBlog?.status as SEOData['status']) ?? 'draft',
    publishedAt:      initialBlog?.published_at      ?? '',
    faqs:             initialBlog?.faqs              ?? [],
  }))

  const buildFormData = (overrideStatus?: string): FormData => {
    const fd = new FormData()
    if (initialBlog?.id) fd.append('id', initialBlog.id)
    fd.append('title', seo.title)
    fd.append('slug', seo.slug)
    fd.append('content_layout', JSON.stringify(blocks))
    fd.append('status', overrideStatus ?? seo.status)
    fd.append('meta_title', seo.metaTitle.slice(0, 60))
    fd.append('meta_description', seo.metaDescription.slice(0, 160))
    fd.append('focus_keywords', seo.focusKeywords)
    fd.append('og_image', seo.ogImage)
    fd.append('canonical_url', seo.canonicalUrl)
    fd.append('faqs', JSON.stringify(seo.faqs))
    if (seo.publishedAt) fd.append('published_at', seo.publishedAt)
    return fd
  }

  const handleSaveDraft = () => {
    if (!seo.title.trim()) { toast.error('Post title is required'); return }
    startTransition(async () => {
      try {
        await saveBlog(buildFormData('draft'))
        toast.success('Draft saved successfully')
        router.push('/digital-marketing/blogs')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  const handlePublish = async () => {
    if (!seo.title.trim()) { toast.error('Post title is required'); return }
    if (!seo.metaTitle.trim()) { toast.error('Meta title is required for publish'); return }
    if (!seo.metaDescription.trim()) { toast.error('Meta description is required for publish'); return }

    setIsPublishing(true)
    try {
      // 1. Save the current state first
      await saveBlog(buildFormData('published'))
      // 2. If editing, call publish endpoint to generate JSON-LD
      if (initialBlog?.id) {
        await publishBlog(initialBlog.id)
      }
      toast.success('🎉 Post published successfully!', { description: 'Article schema JSON-LD has been generated.' })
      router.push('/digital-marketing/blogs')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setIsPublishing(false)
    }
  }

  const isWorking = isPending || isPublishing

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Action Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 bg-card/90 backdrop-blur-xl border-b border-border shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/digital-marketing/blogs')}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Back to blogs"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {initialBlog ? 'Editing Post' : 'New Post'}
            </p>
            <p className="text-sm font-bold text-foreground truncate max-w-xs">
              {seo.title || 'Untitled Post'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status badge */}
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            seo.status === 'published'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : seo.status === 'scheduled'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}>
            {seo.status}
          </span>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isWorking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={isWorking}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
          >
            {isPublishing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <><Sparkles className="w-4 h-4" /> Publish</>
            }
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex flex-1 gap-6 p-6 max-w-[1400px] mx-auto w-full">
        {/* Block Canvas — 65% */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              Content Blocks
            </h2>
            <BlockCanvas blocks={blocks} onChange={setBlocks} />
          </div>
        </div>

        {/* SEO Panel — 35% */}
        <div className="w-[340px] xl:w-[380px] shrink-0">
          <div className="sticky top-[73px]">
            <SEOPanel data={seo} onChange={setSEO} />
          </div>
        </div>
      </div>
    </div>
  )
}
