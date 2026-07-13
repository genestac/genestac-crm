'use client'

import React, { useRef, useEffect } from 'react'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import type { HeadingData } from '../types'
import { generateAnchorId } from '../types'

interface Props {
  data: HeadingData
  onChange: (data: HeadingData) => void
}

const LEVELS: HeadingData['level'][] = ['h2', 'h3', 'h4']

const ALIGNS: { value: 'left' | 'center' | 'right'; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'left',   label: 'Left',   icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right',  label: 'Right',  icon: AlignRight },
]

export function HeadingBlock({ data, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = () => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }

  useEffect(() => {
    resize()
  }, [data.text, data.level])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    resize()
    const text = e.target.value
    onChange({ ...data, text, id: generateAnchorId(text) })
  }

  const handleLevelChange = (level: HeadingData['level']) => {
    onChange({ ...data, level })
  }

  const sizeMap: Record<HeadingData['level'], string> = {
    h2: 'text-3xl font-bold',
    h3: 'text-2xl font-bold',
    h4: 'text-xl font-semibold',
  }

  const alignMap = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right'
  }

  return (
    <div className="group relative">
      {/* Level Picker */}
      <div className="absolute -top-8 left-0 hidden group-focus-within:flex items-center gap-1 bg-white dark:bg-card border border-border rounded-lg shadow-md px-2 py-1 z-10">
        {LEVELS.map(level => (
          <button
            key={level}
            type="button"
            onClick={() => handleLevelChange(level)}
            className={`text-xs px-2 py-0.5 rounded font-bold uppercase transition-colors ${
              data.level === level
                ? 'bg-violet-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {level.toUpperCase()}
          </button>
        ))}
        
        <div className="w-px h-4 bg-border mx-1" />
        
        {ALIGNS.map(align => (
          <button
            key={align.value}
            type="button"
            title={align.label}
            onClick={() => onChange({ ...data, align: align.value })}
            className={`p-1 rounded transition-colors ${
              data.align === align.value || (!data.align && align.value === 'left')
                ? 'bg-violet-600 text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <align.icon className="w-3.5 h-3.5" />
          </button>
        ))}

        {data.id && (
          <span className="ml-2 text-[10px] text-muted-foreground/50 font-mono">#{data.id}</span>
        )}
      </div>

      <textarea
        ref={ref}
        value={data.text}
        onChange={handleInput}
        placeholder="Write a heading…"
        rows={1}
        className={`w-full outline-none text-foreground bg-transparent resize-none overflow-hidden ${sizeMap[data.level]} ${alignMap[data.align || 'left']}`}
      />
    </div>
  )
}
