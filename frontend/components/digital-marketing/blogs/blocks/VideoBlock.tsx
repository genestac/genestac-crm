'use client'

import { useState } from 'react'
import { Play, Video } from 'lucide-react'
import type { VideoData } from '../types'

interface Props {
  data: VideoData
  onChange: (data: VideoData) => void
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  // Direct MP4/video file
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return null // handled as <video>
  return null
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url)
}

export function VideoBlock({ data, onChange }: Props) {
  const [showTranscript, setShowTranscript] = useState(false)
  const embedUrl = getEmbedUrl(data.url)

  const update = (field: keyof VideoData, value: string) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
            Video URL
          </label>
          <input
            type="url"
            value={data.url}
            onChange={e => update('url', e.target.value)}
            placeholder="YouTube, Vimeo, or direct .mp4 URL"
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
            Video Title <span className="text-violet-400">(SEO)</span>
          </label>
          <input
            type="text"
            value={data.title}
            onChange={e => update('title', e.target.value)}
            placeholder="Descriptive title for search engines"
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
      </div>

      {/* Preview */}
      {data.url && (
        <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
          {embedUrl ? (
            <div className="relative aspect-video">
              <iframe
                src={embedUrl}
                title={data.title || 'Video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ) : isDirectVideo(data.url) ? (
            <video
              src={data.url}
              controls
              preload="metadata"
              title={data.title}
              className="w-full rounded-xl"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Video className="w-8 h-8 opacity-40" />
              <p className="text-sm">Enter a valid YouTube, Vimeo, or .mp4 URL to preview</p>
            </div>
          )}
        </div>
      )}

      {!data.url && (
        <div className="flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed border-border text-muted-foreground gap-2">
          <div className="flex gap-3">
            <Video className="w-7 h-7 text-red-500 opacity-70" />
            <Video className="w-7 h-7 opacity-40" />
          </div>
          <p className="text-sm font-medium">Paste a video URL above to embed</p>
          <p className="text-xs">YouTube · Vimeo · Direct MP4</p>
        </div>
      )}

      {/* Transcript (Video SEO) */}
      <div>
        <button
          type="button"
          onClick={() => setShowTranscript(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
        >
          <Play className="w-3 h-3" />
          {showTranscript ? 'Hide' : 'Add'} Transcript (Video SEO)
        </button>
        {showTranscript && (
          <textarea
            value={data.transcript}
            onChange={e => update('transcript', e.target.value)}
            placeholder="Paste the video transcript here. This is indexed by search engines to improve video SEO and accessibility."
            rows={6}
            className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50 resize-y"
          />
        )}
      </div>
    </div>
  )
}
