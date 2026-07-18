'use client'

import React, { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { BlogLayoutRenderer } from '@/components/blogs/BlogLayoutRenderer'
import { TableOfContents } from '@/components/blogs/TableOfContents'

export default function BlogPreviewPage() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    // Read from localStorage on mount
    const stored = localStorage.getItem('blog_preview_data')
    if (stored) {
      try {
        setData(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse preview data', e)
      }
    }
  }, [])

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 animate-pulse">Loading preview...</p>
      </div>
    )
  }

  const { seo, blocks } = data
  const publishDate = seo.publishedAt ? new Date(seo.publishedAt) : new Date()

  // Mock a "blog" object matching what the renderer expects
  const mockBlog = {
    ...seo,
    title: seo.title || 'Untitled Post',
    content_layout: blocks,
    focus_keywords: seo.focusKeywords ? seo.focusKeywords.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    faqs: seo.faqs || [],
    coverImage: seo.coverImage || '',
    ogImage: seo.ogImage || '',
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* ── Full-bleed Hero ── */}
      <section className="relative bg-white border-b border-slate-200 pt-20 pb-16 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(14,165,233,1) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-sky-100/60 rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-teal-50/80 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Category pill + date */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
            <span className="bg-sky-100 text-sky-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
              Article
            </span>
            <span className="w-1 h-1 bg-slate-300 rounded-full" />
            <time className="text-sm text-slate-500 font-medium" dateTime={publishDate.toISOString()}>
              {format(publishDate, "MMMM d, yyyy")}
            </time>
            {mockBlog.focus_keywords && mockBlog.focus_keywords.length > 0 && (
              <>
                <span className="w-1 h-1 bg-slate-300 rounded-full" />
                <span className="text-sm text-slate-500">
                  {Math.max(1, Math.ceil(blocks.length * 0.8))} min read
                </span>
              </>
            )}
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.08] tracking-tight mb-6">
            {mockBlog.title}
          </h1>

          {/* Excerpt */}
          {mockBlog.metaDescription && (
            <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed mb-8">
              {mockBlog.metaDescription}
            </p>
          )}
        </div>
      </section>

      {/* ── Hero Image ── */}
      {(mockBlog.coverImage || mockBlog.ogImage) && (
        <div className="relative bg-white border-b border-slate-100 py-10">
          <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-sky-50/60 to-slate-50 pointer-events-none" />
          <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-12">
            <div className="relative rounded-3xl overflow-hidden bg-white shadow-xl">
              <div className="h-1.5 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-sky-600" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mockBlog.coverImage || mockBlog.ogImage}
                alt={mockBlog.title}
                className="w-full object-cover" 
                style={{ aspectRatio: '16/9' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Article body + sidebar ── */}
      <main className="bg-slate-50 pt-12 pb-24">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex flex-col xl:flex-row gap-8 xl:gap-10 items-start">
            
            {/* ── Main Article ── */}
            <article className="w-full xl:flex-1 min-w-0">
              <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-200/60">
                <div className="h-1.5 w-full bg-gradient-to-r from-sky-500 via-teal-400 to-sky-600" />
                <div className="px-8 sm:px-14 lg:px-20 pt-12 pb-10">
                  <BlogLayoutRenderer layout={mockBlog.content_layout} />
                </div>

                {/* FAQs Section */}
                {mockBlog.faqs && mockBlog.faqs.length > 0 && (
                  <div className="px-8 sm:px-14 lg:px-20 pb-12">
                    <div className="border-t border-slate-100 pt-10">
                      <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">
                        Frequently Asked Questions
                      </h3>
                      <div className="space-y-4">
                        {mockBlog.faqs.map((faq: { question: string; answer: string }, idx: number) => (
                          <details key={idx} className="group bg-slate-50 rounded-2xl border border-slate-200/60 shadow-sm [&_summary::-webkit-details-marker]:hidden">
                            <summary className="flex items-start justify-between cursor-pointer p-6 md:p-8 outline-none focus:ring-2 focus:ring-sky-500/50 rounded-2xl select-none">
                              <h4 className="text-lg md:text-xl font-bold text-slate-900 flex items-start gap-3">
                                <span className="text-sky-500 shrink-0">Q{idx + 1}.</span>
                                {faq.question}
                              </h4>
                            </summary>
                            <div className="px-6 md:px-8 pb-6 md:pb-8 pt-0">
                              <div className="border-t border-slate-200/80 pt-6">
                                <p className="text-slate-600 leading-relaxed md:text-lg flex items-start gap-3">
                                  <span className="text-slate-400 font-bold shrink-0 opacity-50">A.</span>
                                  {faq.answer}
                                </p>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </article>

            {/* ── Sidebar ── */}
            <aside className="hidden xl:flex flex-col gap-5 w-[320px] shrink-0">
              <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-200/60">
                <TableOfContents layout={mockBlog.content_layout} />
              </div>
            </aside>

          </div>
        </div>
      </main>

    </div>
  )
}
