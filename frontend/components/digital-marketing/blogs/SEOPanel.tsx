'use client'

import { useState } from 'react'
import { useRef } from 'react'
import {
  Search, Share2, Tag, Link2, Globe, Calendar,
  AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp,
  HelpCircle, Plus, Trash2, UploadCloud, Loader2
} from 'lucide-react'
import { uploadBlogImage } from '@/app/digital-marketing/actions'
import { ImageCropperModal } from './ImageCropperModal'
import { toLocalDatetimeInput } from '@/types/blog'

export interface SEOData {
  title: string
  slug: string
  metaTitle: string
  metaDescription: string
  focusKeywords: string
  coverImage: string
  ogImage: string
  canonicalUrl: string
  status: 'draft' | 'published' | 'scheduled'
  publishedAt: string
  faqs: { question: string; answer: string }[]
}

interface Props {
  data: SEOData
  onChange: (data: SEOData) => void
  baseUrl?: string
}

function CharCounter({
  value,
  max,
  warn,
}: {
  value: string
  max: number
  warn: number
}) {
  const len = value.length
  const isOk   = len <= warn
  const isWarn  = len > warn && len <= max
  const isError = len > max
  return (
    <span
      className={`text-xs font-mono ${
        isError ? 'text-red-500' : isWarn ? 'text-amber-500' : 'text-emerald-500'
      }`}
    >
      {len}/{max}
      {isError && ' ⚠ too long'}
      {isWarn  && ' ⚡ close to limit'}
      {isOk && len > 0 && ' ✓'}
    </span>
  )
}

function SectionToggle({
  label,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  label: string
  icon: React.FC<{ className?: string }>
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-3 text-sm font-semibold text-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {label}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  )
}

export function SEOPanel({ data, onChange, baseUrl = 'https://genestac.com/blog' }: Props) {
  const [isUploadingOg, setIsUploadingOg] = useState(false)
  const ogFileRef = useRef<HTMLInputElement>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const coverFileRef = useRef<HTMLInputElement>(null)

  // Cropper state
  const [cropperSrc, setCropperSrc] = useState<string | null>(null)
  const [cropperTarget, setCropperTarget] = useState<'cover' | 'og' | null>(null)

  const update = <K extends keyof SEOData>(field: K, value: SEOData[K]) => onChange({ ...data, [field]: value })

  // Open the cropper with the selected file
  const openCropper = (files: FileList | null, target: 'cover' | 'og') => {
    if (!files || files.length === 0) return
    const file = files[0]
    const objectUrl = URL.createObjectURL(file)
    setCropperSrc(objectUrl)
    setCropperTarget(target)
  }

  // Upload cropped blob
  const handleCropConfirm = async (blob: Blob) => {
    if (!cropperTarget) return
    const isOg = cropperTarget === 'og'
    isOg ? setIsUploadingOg(true) : setIsUploadingCover(true)
    setCropperSrc(null)
    setCropperTarget(null)

    try {
      const fd = new FormData()
      fd.append('file', blob, 'image.webp')
      const res = await uploadBlogImage(fd)
      isOg ? update('ogImage', res.url) : update('coverImage', res.url)
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      isOg ? setIsUploadingOg(false) : setIsUploadingCover(false)
    }
  }

  // Auto-generate slug from title
  const autoSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')

  const handleTitleChange = (val: string) => {
    onChange({
      ...data,
      title: val,
      slug: data.slug || autoSlug(val),
      metaTitle: data.metaTitle || val.slice(0, 60),
    })
  }

  const previewUrl = `${baseUrl}/${data.slug || 'your-blog-slug'}`

  // Aspect ratios
  const COVER_RATIO = 16 / 9
  const OG_RATIO = 1200 / 630 // ≈ 1.905:1, standard OpenGraph

  return (
    <>
      {/* Cropper modal */}
      {cropperSrc && cropperTarget && (
        <ImageCropperModal
          imageSrc={cropperSrc}
          aspectRatio={cropperTarget === 'cover' ? COVER_RATIO : OG_RATIO}
          ratioLabel={cropperTarget === 'cover' ? '16:9' : '1200:630'}
          onConfirm={handleCropConfirm}
          onCancel={() => { setCropperSrc(null); setCropperTarget(null) }}
        />
      )}
      <aside className="w-full space-y-0 bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <Search className="w-4 h-4" />
          SEO Control Panel
        </h2>
        <p className="text-xs text-violet-100 mt-0.5">Manage metadata, previews & structured data</p>
      </div>

      <div className="px-5 py-1 divide-y divide-border">

        {/* Post Settings */}
        <SectionToggle label="Post Settings" icon={Globe}>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Post Title</label>
            <input
              type="text"
              value={data.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Enter post title"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">URL Slug</label>
            <div className="flex items-center rounded-xl border border-border overflow-hidden focus-within:ring-2 focus-within:ring-violet-500/50">
              <span className="px-2 text-xs text-muted-foreground bg-muted border-r border-border shrink-0">/blog/</span>
              <input
                type="text"
                value={data.slug}
                onChange={e => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="your-post-slug"
                className="flex-1 text-sm px-2 py-2 bg-background outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Status</label>
            <select
              value={data.status}
              onChange={e => update('status', e.target.value as SEOData['status'])}
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          {data.status === 'scheduled' && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5 inline mr-1 text-blue-500" /> Publish At (Timer)
              </label>
              <input
                type="datetime-local"
                value={toLocalDatetimeInput(data.publishedAt)}
                onChange={e => update('publishedAt', e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Post will auto-publish when this timer expires.
              </p>
            </div>
          )}
          
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider flex items-center justify-between">
              Cover Image (Hero)
              <span className="text-[10px] font-normal text-violet-500 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded">16:9 crop</span>
            </label>
            {/* Cover image 4:3 preview */}
            {data.coverImage && !isUploadingCover && (
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted mb-2 group">
                <img src={data.coverImage} alt="Cover preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => coverFileRef.current?.click()}
                    className="text-white text-xs font-semibold bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Change Image
                  </button>
                </div>
              </div>
            )}
            {isUploadingCover ? (
              <div className="flex items-center justify-center gap-2 py-4 text-violet-600 dark:text-violet-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-semibold">Uploading...</span>
              </div>
            ) : !data.coverImage && (
              <div
                className="border-2 border-dashed rounded-xl transition-colors border-border hover:border-violet-400 bg-background cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); openCropper(e.dataTransfer.files, 'cover') }}
                onClick={() => coverFileRef.current?.click()}
              >
                <div className="p-4 flex flex-col items-center justify-center text-center">
                  <UploadCloud className="w-6 h-6 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">Drop image or click to upload</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Will be cropped to 16:9</p>
                </div>
              </div>
            )}
            <input
              type="file" ref={coverFileRef} accept="image/*"
              onChange={e => openCropper(e.target.files, 'cover')}
              className="hidden"
            />
            {data.coverImage && !isUploadingCover && (
              <button
                type="button"
                onClick={() => coverFileRef.current?.click()}
                className="mt-1.5 text-[11px] text-muted-foreground hover:text-violet-500 transition-colors w-full text-center"
              >
                Click preview to change · Will re-open cropper
              </button>
            )}
          </div>

        </SectionToggle>

        {/* Google SERP Preview */}
        <SectionToggle label="Google Preview" icon={Search}>
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
              Meta Title
              <CharCounter value={data.metaTitle} max={60} warn={50} />
            </label>
            <input
              type="text"
              value={data.metaTitle}
              onChange={e => update('metaTitle', e.target.value)}
              maxLength={70}
              placeholder="Meta title (≤ 60 chars)"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
              Meta Description
              <CharCounter value={data.metaDescription} max={160} warn={140} />
            </label>
            <textarea
              value={data.metaDescription}
              onChange={e => update('metaDescription', e.target.value)}
              maxLength={180}
              rows={3}
              placeholder="Meta description (≤ 160 chars)"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
            />
          </div>

          {/* SERP Mock */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Search Result Preview</p>
            <div className="space-y-0.5">
              <p className="text-xs text-green-700 dark:text-green-500 truncate">{previewUrl}</p>
              <p
                className="text-base font-medium text-blue-700 dark:text-blue-400 leading-snug line-clamp-1"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                {data.metaTitle || data.title || 'Your Post Title Here'}
              </p>
              <p
                className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 leading-snug"
                style={{ fontFamily: 'Arial, sans-serif' }}
              >
                {data.metaDescription || 'Your meta description will appear here. Write something compelling to improve click-through rates from search results.'}
              </p>
            </div>
          </div>
        </SectionToggle>

        {/* Open Graph / Social Preview */}
        <SectionToggle label="Social Preview (OG)" icon={Share2} defaultOpen={false}>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider flex items-center justify-between">
              Social Preview Image
              <span className="text-[10px] font-normal text-violet-500 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded">1200:630 crop</span>
            </label>
            {/* OG preview */}
            {data.ogImage && !isUploadingOg && (
              <div className="relative aspect-[1200/630] rounded-xl overflow-hidden bg-muted mb-2 group">
                <img src={data.ogImage} alt="OG preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => ogFileRef.current?.click()}
                    className="text-white text-xs font-semibold bg-white/20 hover:bg-white/30 backdrop-blur-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Change Image
                  </button>
                </div>
              </div>
            )}
            {isUploadingOg ? (
              <div className="flex items-center justify-center gap-2 py-4 text-violet-600 dark:text-violet-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-semibold">Uploading...</span>
              </div>
            ) : !data.ogImage && (
              <div
                className="border-2 border-dashed rounded-xl transition-colors border-border hover:border-violet-400 bg-background cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); openCropper(e.dataTransfer.files, 'og') }}
                onClick={() => ogFileRef.current?.click()}
              >
                <div className="p-4 flex flex-col items-center justify-center text-center">
                  <UploadCloud className="w-6 h-6 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">Drop image or click to upload</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Will be cropped to 1200×630</p>
                </div>
              </div>
            )}
            <input
              type="file" ref={ogFileRef} accept="image/*"
              onChange={e => openCropper(e.target.files, 'og')}
              className="hidden"
            />
          </div>

          {/* OG Card Preview */}
          {data.ogImage && (
          <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
            <div className="relative aspect-[1200/630] bg-muted overflow-hidden">
                <img src={data.ogImage} alt="OG preview" className="w-full h-full object-cover" />
            </div>
            <div className="px-3 py-2 border-t border-border">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">genestac.com</p>
              <p className="text-sm font-semibold text-foreground line-clamp-1 mt-0.5">
                {data.metaTitle || data.title || 'Post Title'}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {data.metaDescription || 'Post description…'}
              </p>
            </div>
          </div>
          )}
        </SectionToggle>

        {/* Keywords & Canonical */}
        <SectionToggle label="Keywords & Canonical" icon={Tag} defaultOpen={false}>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
              Focus Keywords
            </label>
            <input
              type="text"
              value={data.focusKeywords}
              onChange={e => update('focusKeywords', e.target.value)}
              placeholder="keyword1, keyword2, keyword3"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <p className="text-xs text-muted-foreground mt-1">Comma-separated. Used for internal content auditing.</p>
            {/* Keyword chips */}
            {data.focusKeywords && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {data.focusKeywords.split(',').filter(k => k.trim()).map((kw, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium">
                    <Tag className="w-2.5 h-2.5" />
                    {kw.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
              <Link2 className="w-3 h-3 inline mr-1" /> Canonical URL
            </label>
            <input
              type="url"
              value={data.canonicalUrl}
              onChange={e => update('canonicalUrl', e.target.value)}
              placeholder="Leave blank to use default URL"
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
            />
            <p className="text-xs text-muted-foreground mt-1">Set only if this content is republished from another URL.</p>
          </div>
        </SectionToggle>

        {/* FAQs */}
        <SectionToggle label="FAQs (Rich Snippets)" icon={HelpCircle} defaultOpen={false}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Adding FAQs automatically generates <strong>FAQPage JSON-LD schema</strong> for Google Rich Snippets, increasing your chances of appearing in the "People Also Ask" box.
            </p>
            
            <div className="space-y-3">
              {(data.faqs || []).map((faq, index) => (
                <div key={index} className="relative p-3 bg-muted/30 border border-border rounded-xl space-y-3 group">
                  <button
                    type="button"
                    onClick={() => {
                      const newFaqs = [...(data.faqs || [])]
                      newFaqs.splice(index, 1)
                      update('faqs', newFaqs)
                    }}
                    className="absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-red-500 bg-background rounded-md shadow-sm border border-border opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove FAQ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div>
                    <label className="flex items-center justify-between text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                      Question {index + 1}
                      <CharCounter value={faq.question} max={100} warn={80} />
                    </label>
                    <input
                      type="text"
                      value={faq.question}
                      onChange={e => {
                        const newFaqs = [...(data.faqs || [])]
                        newFaqs[index].question = e.target.value
                        update('faqs', newFaqs)
                      }}
                      placeholder="e.g., What is digital marketing?"
                      className="w-full text-sm px-3 py-1.5 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                  </div>
                  <div>
                    <label className="flex items-center justify-between text-[10px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                      Answer
                      <CharCounter value={faq.answer} max={300} warn={250} />
                    </label>
                    <textarea
                      value={faq.answer}
                      onChange={e => {
                        const newFaqs = [...(data.faqs || [])]
                        newFaqs[index].answer = e.target.value
                        update('faqs', newFaqs)
                      }}
                      placeholder="Clear, concise answer..."
                      rows={2}
                      className="w-full text-sm px-3 py-1.5 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                update('faqs', [...(data.faqs || []), { question: '', answer: '' }])
              }}
              className="w-full py-2 px-3 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-xl border border-dashed border-violet-300 text-violet-700 bg-violet-50/50 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-400 dark:bg-violet-950/20 dark:hover:bg-violet-900/40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add FAQ
            </button>
          </div>
        </SectionToggle>

      </div>

      {/* Structured Data note */}
      <div className="px-5 py-3 bg-violet-50 dark:bg-violet-950/20 border-t border-violet-200 dark:border-violet-800">
        <p className="text-xs text-violet-700 dark:text-violet-300 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Article JSON-LD schema markup is automatically generated and saved when you <strong>Publish</strong> this post.
        </p>
      </div>
    </aside>
    </>
  )
}
