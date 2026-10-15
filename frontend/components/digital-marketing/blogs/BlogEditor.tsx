'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Save, Globe, Eye, ArrowLeft, Loader2, Sparkles, Wand2, X, CheckCircle2, Clock, Calendar,
} from 'lucide-react'
import { BlockCanvas } from './BlockCanvas'
import { SEOPanel, type SEOData } from './SEOPanel'
import type { ContentBlock } from './types'
import { saveBlog, publishBlog } from '@/app/digital-marketing/actions'
import type { Blog } from '@/app/digital-marketing/actions'
import { toLocalDatetimeInput } from '@/types/blog'

interface Props {
  initialBlog?: Blog | null
}

const EMPTY_SEO: SEOData = {
  title: '',
  slug: '',
  metaTitle: '',
  metaDescription: '',
  focusKeywords: '',
  coverImage: '',
  ogImage: '',
  canonicalUrl: '',
  status: 'draft',
  publishedAt: '',
  faqs: [],
}

const AUTO_SAVE_DELAY = 30000 // 30 seconds

export function BlogEditor({ initialBlog }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPublishing, setIsPublishing] = useState(false)
  const [isScheduling, setIsScheduling] = useState(false)

  const [blocks, setBlocks] = useState<ContentBlock[]>(
    ((initialBlog?.content_layout as unknown) as ContentBlock[]) ?? []
  )

  const [seo, setSEO] = useState<SEOData>(() => ({
    title: initialBlog?.title ?? '',
    slug:  initialBlog?.slug  ?? '',
    metaTitle:        initialBlog?.meta_title        ?? '',
    metaDescription:  initialBlog?.meta_description  ?? '',
    focusKeywords:    (initialBlog?.focus_keywords ?? []).join(', '),
    coverImage:       initialBlog?.cover_image       ?? '',
    ogImage:          initialBlog?.og_image          ?? '',
    canonicalUrl:     initialBlog?.canonical_url     ?? '',
    status:           (initialBlog?.status as SEOData['status']) ?? 'draft',
    publishedAt:      initialBlog?.published_at      ?? '',
    faqs:             initialBlog?.faqs              ?? [],
  }))

  // ─── Schedule Modal State ─────────────────────────────────────────────────
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDatetime, setScheduleDatetime] = useState<string>(() => {
    return seo.publishedAt ? toLocalDatetimeInput(seo.publishedAt) : ''
  })

  // ─── AI Formatter State ───────────────────────────────────────────────────
  const [showAIModal, setShowAIModal] = useState(false)
  const [rawText, setRawText] = useState('')
  const [isFormatting, setIsFormatting] = useState(false)

  // ─── Auto-save State ─────────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>('')
  const blogIdRef = useRef<string | undefined>(initialBlog?.id)

  // Track whether we have saved once (to get an id for new posts)
  const [savedBlogId, setSavedBlogId] = useState<string | undefined>(initialBlog?.id)

  const buildFormData = useCallback((overrideStatus?: string, overridePublishedAt?: string): FormData => {
    const fd = new FormData()
    const id = savedBlogId || initialBlog?.id
    if (id) fd.append('id', id)
    fd.append('title', seo.title)
    fd.append('slug', seo.slug)
    fd.append('content_layout', JSON.stringify(blocks))
    fd.append('status', overrideStatus ?? seo.status)
    fd.append('meta_title', seo.metaTitle.slice(0, 60))
    fd.append('meta_description', seo.metaDescription.slice(0, 160))
    fd.append('focus_keywords', seo.focusKeywords)
    fd.append('cover_image', seo.coverImage)
    fd.append('og_image', seo.ogImage)
    fd.append('canonical_url', seo.canonicalUrl)
    fd.append('faqs', JSON.stringify(seo.faqs))

    const targetTime = overridePublishedAt ?? seo.publishedAt
    if (targetTime) {
      const parsed = new Date(targetTime)
      const iso = isNaN(parsed.getTime()) ? targetTime : parsed.toISOString()
      fd.append('published_at', iso)
    }
    return fd
  }, [seo, blocks, savedBlogId, initialBlog?.id])

  // ─── Auto-save Logic ─────────────────────────────────────────────────────
  const doAutoSave = useCallback(async () => {
    if (!seo.title.trim()) return // Don't auto-save without a title
    const snapshot = JSON.stringify({ seo, blocks })
    if (snapshot === lastSavedRef.current) return // Nothing changed

    setAutoSaveStatus('saving')
    try {
      await saveBlog(buildFormData())
      lastSavedRef.current = snapshot
      setAutoSaveStatus('saved')
      setTimeout(() => setAutoSaveStatus('idle'), 3000)
    } catch {
      setAutoSaveStatus('error')
      setTimeout(() => setAutoSaveStatus('idle'), 4000)
    }
  }, [seo, blocks, buildFormData])

  // Schedule auto-save whenever content changes
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(doAutoSave, AUTO_SAVE_DELAY)
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [seo, blocks, doAutoSave])

  const handleSaveDraft = () => {
    if (!seo.title.trim()) { toast.error('Post title is required'); return }
    startTransition(async () => {
      try {
        await saveBlog(buildFormData('draft'))
        setSEO(prev => ({ ...prev, status: 'draft' }))
        lastSavedRef.current = JSON.stringify({ seo: { ...seo, status: 'draft' }, blocks })
        toast.success('Draft saved successfully')
        router.push('/digital-marketing/blogs')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Save failed')
      }
    })
  }

  const handleScheduleSubmit = async (customDatetime?: string) => {
    if (!seo.title.trim()) { toast.error('Post title is required'); return }
    const timeToSchedule = customDatetime || scheduleDatetime
    if (!timeToSchedule) { toast.error('Please pick a date and time for publishing'); return }

    const targetDate = new Date(timeToSchedule)
    if (isNaN(targetDate.getTime())) { toast.error('Invalid schedule date/time'); return }
    if (targetDate.getTime() <= Date.now()) {
      toast.error('Scheduled time must be in the future')
      return
    }

    const isoTime = targetDate.toISOString()
    setIsScheduling(true)
    try {
      await saveBlog(buildFormData('scheduled', isoTime))
      setSEO(prev => ({
        ...prev,
        status: 'scheduled',
        publishedAt: toLocalDatetimeInput(isoTime),
      }))
      lastSavedRef.current = JSON.stringify({
        seo: { ...seo, status: 'scheduled', publishedAt: toLocalDatetimeInput(isoTime) },
        blocks,
      })
      setShowScheduleModal(false)
      toast.success('⏰ Post scheduled successfully!', {
        description: `Will automatically publish on ${targetDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`,
      })
      router.push('/digital-marketing/blogs')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Scheduling failed')
    } finally {
      setIsScheduling(false)
    }
  }

  const applyPreset = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 3600 * 1000)
    setScheduleDatetime(toLocalDatetimeInput(d))
  }

  const applyTomorrow = (hour: number, minute: number = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(hour, minute, 0, 0)
    setScheduleDatetime(toLocalDatetimeInput(d))
  }

  const handlePublish = async () => {
    if (!seo.title.trim()) { toast.error('Post title is required'); return }
    if (!seo.metaTitle.trim()) { toast.error('Meta title is required for publish'); return }
    if (!seo.metaDescription.trim()) { toast.error('Meta description is required for publish'); return }

    setIsPublishing(true)
    try {
      await saveBlog(buildFormData('published'))
      if (initialBlog?.id || savedBlogId) {
        await publishBlog((initialBlog?.id || savedBlogId)!)
      }
      toast.success('🎉 Post published successfully!', { description: 'Article schema JSON-LD has been generated.' })
      router.push('/digital-marketing/blogs')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setIsPublishing(false)
    }
  }

  // ─── AI Format Handler ────────────────────────────────────────────────────
  const handleAIFormat = async () => {
    if (!rawText.trim()) { toast.error('Please paste some blog text first'); return }
    setIsFormatting(true)
    try {
      const res = await fetch('/api/ai/format-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      })
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(res.status === 504 ? 'AI request timed out. Try a shorter text.' : 'Invalid response from server.');
      }

      if (!res.ok || data.error) {
        toast.error(data.error || 'Gemini AI formatting failed')
        return
      }

      // Apply SEO fields
      if (data.seo) {
        setSEO(prev => ({
          ...prev,
          title:           data.seo.title           || prev.title,
          slug:            data.seo.slug             || prev.slug,
          metaTitle:       data.seo.metaTitle        || prev.metaTitle,
          metaDescription: data.seo.metaDescription  || prev.metaDescription,
          focusKeywords:   data.seo.focusKeywords     || prev.focusKeywords,
          faqs:            Array.isArray(data.faqs) && data.faqs.length > 0 ? data.faqs : prev.faqs,
        }))
      }

      // Apply blocks
      if (Array.isArray(data.blocks) && data.blocks.length > 0) {
        setBlocks(data.blocks as ContentBlock[])
      }

      setShowAIModal(false)
      setRawText('')
      const faqCount = Array.isArray(data.faqs) ? data.faqs.length : 0
      toast.success(`✨ Blog formatted! ${data.blocks?.length ?? 0} blocks + ${faqCount} FAQs created.`)
    } catch (e: unknown) {
      toast.error('Network error calling Gemini AI')
      console.error(e)
    } finally {
      setIsFormatting(false)
    }
  }

  const isWorking = isPending || isPublishing || isScheduling

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top Action Bar ── */}
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
          {/* Auto-save indicator */}
          <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all duration-300
            bg-muted/50 text-muted-foreground border-border">
            {autoSaveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
            {autoSaveStatus === 'saved'  && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Auto-saved</>}
            {autoSaveStatus === 'error'  && <><X className="w-3 h-3 text-red-500" /> Save failed</>}
            {autoSaveStatus === 'idle'   && <><Clock className="w-3 h-3 opacity-50" /> Auto-save on</>}
          </div>

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

          {/* AI Format Button */}
          <button
            type="button"
            onClick={() => setShowAIModal(true)}
            disabled={isWorking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
          >
            <Wand2 className="w-4 h-4" />
            AI Format
          </button>

          <button
            type="button"
            onClick={() => {
              localStorage.setItem('blog_preview_data', JSON.stringify({ seo, blocks }))
              window.open('/digital-marketing/blogs/preview', '_blank')
            }}
            disabled={isWorking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isWorking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>

          {/* Schedule Button */}
          <button
            type="button"
            onClick={() => {
              setScheduleDatetime(seo.publishedAt ? toLocalDatetimeInput(seo.publishedAt) : toLocalDatetimeInput(new Date(Date.now() + 3600 * 1000)))
              setShowScheduleModal(true)
            }}
            disabled={isWorking}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border transition-all disabled:opacity-50 ${
              seo.status === 'scheduled'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 hover:bg-blue-700 hover:scale-105'
                : 'border-border text-foreground hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
            title="Schedule post to auto-publish on a timer"
          >
            {isScheduling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Clock className={`w-4 h-4 ${seo.status === 'scheduled' ? 'text-white' : 'text-blue-500'}`} />
            )}
            {seo.status === 'scheduled' ? 'Scheduled' : 'Schedule'}
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

      {/* ── Editor Body ── */}
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
          <div className="sticky top-[73px] max-h-[calc(100vh-100px)] overflow-y-auto rounded-2xl scrollbar-hide">
            <SEOPanel data={seo} onChange={setSEO} />
          </div>
        </div>
      </div>

      {/* ── AI Format Modal ── */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-600 to-violet-600 rounded-xl text-white shadow-lg">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">AI Blog Formatter</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Paste raw blog text — Gemini AI will format it completely</p>
                </div>
              </div>
              <button
                onClick={() => { setShowAIModal(false); setRawText('') }}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 border border-blue-100 dark:border-blue-900 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">✨ What Gemini AI will do:</p>
                <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-300">
                  <li>Auto-detect title, slug, meta title &amp; meta description</li>
                  <li>Generate H2, H3, H4 heading structure</li>
                  <li>Format body text with proper paragraphs, bold, lists</li>
                  <li>Create tables for any comparisons or data</li>
                  <li>Add CTA buttons at the right spots</li>
                  <li>Fill in focus keywords automatically</li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-100 dark:border-amber-900 text-sm text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">💡</span>
                  <p className="font-semibold">How to generate a blog for this tool</p>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300 mb-3 leading-relaxed">
                  To get the best formatting, copy and paste this prompt into ChatGPT or Claude to generate your raw blog text. The AI will automatically parse the result and fill both the content blocks and the <strong>SEO Control Panel</strong> on the right!
                </p>
                <div className="relative">
                  <textarea
                    readOnly
                    className="w-full h-36 p-3 text-xs font-mono bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800 rounded-lg text-gray-700 dark:text-gray-300 resize-none"
                    value="Write a comprehensive, long-form blog about [ENTER TOPIC HERE]. First, provide an SEO-optimized title, a URL slug, a meta description (under 160 chars), and 3-5 focus keywords. Then, structure the blog clearly with H2, H3, and H4 headings. Use bullet points and numbered lists where appropriate. Include a comparison table if relevant. Add a call-to-action button at the end. Provide 4-6 FAQs at the bottom. DO NOT include any images. Ensure the structure is clear and the length is detailed enough so it can be easily formatted into blocks."
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("Write a comprehensive, long-form blog about [ENTER TOPIC HERE]. First, provide an SEO-optimized title, a URL slug, a meta description (under 160 chars), and 3-5 focus keywords. Then, structure the blog clearly with H2, H3, and H4 headings. Use bullet points and numbered lists where appropriate. Include a comparison table if relevant. Add a call-to-action button at the end. Provide 4-6 FAQs at the bottom. DO NOT include any images. Ensure the structure is clear and the length is detailed enough so it can be easily formatted into blocks.")
                      toast.success('Prompt copied to clipboard!')
                    }}
                    className="absolute top-2 right-2 px-2 py-1 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 text-[10px] font-bold rounded-md hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
                  >
                    COPY PROMPT
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Paste your raw blog content here
                </label>
                <textarea
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder="Paste your unformatted blog text here…

For example:
Introduction to Weight Loss with Genestac
Weight loss is difficult. Genestac uses medical approach...

Why diets fail
Most diets fail because they ignore hormones...

Our Plans
Starter - 4999/month - Basic plan
Medical - 12999/month - Doctor guided
Premium - 29999/month - Full support

...etc"
                  className="w-full h-64 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono leading-relaxed"
                  disabled={isFormatting}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-400">{rawText.length} characters</p>
                  {rawText.length > 0 && (
                    <button
                      onClick={() => setRawText('')}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {isFormatting && (
                <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-4 border border-violet-100 dark:border-violet-900 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">Gemini AI is formatting your blog…</p>
                    <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">This takes 5-15 seconds depending on length</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-gray-50 dark:bg-gray-800/50 rounded-b-3xl">
              <button
                onClick={() => { setShowAIModal(false); setRawText('') }}
                disabled={isFormatting}
                className="px-5 py-2.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAIFormat}
                disabled={isFormatting || !rawText.trim()}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
              >
                {isFormatting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Formatting…</>
                  : <><Wand2 className="w-4 h-4" /> Format with Gemini AI</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Post Modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-border">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">Schedule Post</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Set a timer for automatic publishing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Presets */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Quick Presets
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset(1)}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-border bg-muted/30 hover:bg-muted text-foreground transition-all hover:scale-102"
                  >
                    +1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(3)}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-border bg-muted/30 hover:bg-muted text-foreground transition-all hover:scale-102"
                  >
                    +3 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTomorrow(9, 0)}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-border bg-muted/30 hover:bg-muted text-foreground transition-all hover:scale-102"
                  >
                    Tomorrow 9 AM
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTomorrow(18, 0)}
                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-border bg-muted/30 hover:bg-muted text-foreground transition-all hover:scale-102"
                  >
                    Tomorrow 6 PM
                  </button>
                </div>
              </div>

              {/* Date & Time Picker */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  Target Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDatetime}
                  onChange={e => setScheduleDatetime(e.target.value)}
                  className="w-full text-base font-medium px-4 py-2.5 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {/* Informational Card */}
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 border border-blue-100 dark:border-blue-900/50 space-y-1.5">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  Automatic Status Transition
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  The post status will change to <strong>Scheduled</strong>. When your chosen timer arrives, the CRM backend scheduler will automatically switch it to <strong>Published</strong> and generate the Article Schema JSON-LD.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-gray-50 dark:bg-gray-800/50 rounded-b-3xl">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                disabled={isScheduling}
                className="px-5 py-2.5 text-sm font-medium rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleScheduleSubmit()}
                disabled={isScheduling || !scheduleDatetime}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
              >
                {isScheduling ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling…</>
                ) : (
                  <><Clock className="w-4 h-4" /> Confirm Schedule</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

