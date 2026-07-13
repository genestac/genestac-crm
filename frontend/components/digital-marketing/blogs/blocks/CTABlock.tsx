'use client'

import { ExternalLink, MousePointerClick } from 'lucide-react'
import type { CTAData } from '../types'

interface Props {
  data: CTAData
  onChange: (data: CTAData) => void
}

const PRESETS = [
  { label: 'Violet',  bg: '#7C3AED', text: '#FFFFFF' },
  { label: 'Teal',   bg: '#0D9488', text: '#FFFFFF' },
  { label: 'Ocean',  bg: '#0A6C87', text: '#FFFFFF' },
  { label: 'Green',  bg: '#16A34A', text: '#FFFFFF' },
  { label: 'Coral',  bg: '#E11D48', text: '#FFFFFF' },
  { label: 'Dark',   bg: '#1E293B', text: '#FFFFFF' },
  { label: 'Light',  bg: '#F1F5F9', text: '#1E293B' },
]

export function CTABlock({ data, onChange }: Props) {
  const update = (field: keyof CTAData, value: string | boolean) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
            Button Text
          </label>
          <input
            type="text"
            value={data.text}
            onChange={e => update('text', e.target.value)}
            placeholder="e.g. Book a Free Consultation"
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
            Target URL
          </label>
          <input
            type="url"
            value={data.href}
            onChange={e => update('href', e.target.value)}
            placeholder="https://"
            className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
      </div>

      {/* Color presets */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Button Style
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange({ ...data, bgColor: preset.bg, color: preset.text })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                data.bgColor === preset.bg ? 'border-violet-500 scale-105' : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: preset.bg, color: preset.text }}
            >
              {preset.label}
            </button>
          ))}
          {/* Custom color */}
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="color"
              value={data.bgColor}
              onChange={e => update('bgColor', e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0"
            />
            Custom
          </label>
        </div>
      </div>

      {/* Open in new tab */}
      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={data.openInNewTab}
          onChange={e => update('openInNewTab', e.target.checked)}
          className="rounded border-border accent-violet-600"
        />
        Open in new tab
      </label>

      {/* Live Preview */}
      <div className="pt-2">
        <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-1.5">
          <MousePointerClick className="w-3.5 h-3.5" /> Preview
        </p>
        <div className="flex items-center gap-4 p-5 rounded-xl bg-muted/30 border border-dashed border-border">
          {data.text ? (
            <a
              href={data.href || '#'}
              target={data.openInNewTab ? '_blank' : '_self'}
              rel="noopener noreferrer"
              onClick={e => e.preventDefault()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm shadow-lg transition-all hover:scale-105 hover:shadow-xl"
              style={{ backgroundColor: data.bgColor, color: data.color }}
            >
              {data.text}
              {data.openInNewTab && <ExternalLink className="w-4 h-4" />}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground italic">Button preview will appear here</p>
          )}
        </div>
      </div>
    </div>
  )
}
