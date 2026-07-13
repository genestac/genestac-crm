'use client'

import { useRef, useEffect, useState } from 'react'
import { Bold, Italic, Underline, Link, AlignLeft, AlignCenter, AlignRight, AlignJustify, Highlighter, X, ChevronDown } from 'lucide-react'
import type { TextData } from '../types'

interface Props {
  data: TextData
  onChange: (data: TextData) => void
}

export function TextBlock({ data, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [showHighlights, setShowHighlights] = useState(false)
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
  })
  
  // Track last HTML to avoid update loops
  const lastHtml = useRef(data.html)

  const HIGHLIGHT_COLORS = [
    { color: '#FEF08A', label: 'Yellow' },
    { color: '#86EFAC', label: 'Green' },
    { color: '#93C5FD', label: 'Blue' },
    { color: '#FDA4AF', label: 'Pink' },
    { color: '#FCA5A1', label: 'Red' },
    { color: '#C4B5FD', label: 'Purple' },
    { color: '#FED7AA', label: 'Orange' },
    { color: '#ffffff', label: 'White (Clear)' },
  ]

  // Sync external changes (initial load, undo, or block reordering)
  useEffect(() => {
    if (ref.current && data.html !== lastHtml.current) {
      ref.current.innerHTML = data.html
      lastHtml.current = data.html
    }
  }, [data.html])

  const handleInput = () => {
    const html = ref.current?.innerHTML ?? ''
    if (html !== lastHtml.current) {
      lastHtml.current = html
      onChange({ html })
    }
  }

  const checkFormat = () => {
    let isHighlight = false
    if (ref.current) {
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.getRangeAt(0).commonAncestorContainer
        if (node.nodeType === 3) node = node.parentNode
        
        if (ref.current.contains(node)) {
          while (node && node !== ref.current) {
            if (node instanceof HTMLElement && node.style.backgroundColor) {
              const bg = node.style.backgroundColor
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'inherit' && bg !== 'initial') {
                isHighlight = true
                break
              }
            }
            node = node.parentNode
          }
        }
      }
    }

    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      highlight: isHighlight
    })
  }

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    ref.current?.focus()
    handleInput()
    checkFormat()
  }

  const insertLink = () => {
    const sel = window.getSelection()
    const url = prompt('Enter URL:', 'https://')
    if (url && sel && sel.toString()) {
      exec('createLink', url)
    }
  }

  return (
    <div className="group relative">
      {/* Mini toolbar */}
      <div className="absolute -top-10 left-0 hidden group-focus-within:flex items-center gap-0.5 bg-white dark:bg-card border border-border rounded-lg shadow-md px-1.5 py-1 z-10">
        {[
          { icon: Bold,      cmd: 'bold',      title: 'Bold' },
          { icon: Italic,    cmd: 'italic',    title: 'Italic' },
          { icon: Underline, cmd: 'underline', title: 'Underline' },
        ].map(({ icon: Icon, cmd, title }) => (
          <button
            key={cmd}
            type="button"
            onMouseDown={e => { e.preventDefault(); exec(cmd) }}
            title={title}
            className={`p-1.5 rounded transition-colors ${
              activeFormats[cmd as keyof typeof activeFormats] 
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' 
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        {[
          { icon: AlignLeft,    cmd: 'justifyLeft',   title: 'Align Left' },
          { icon: AlignCenter,  cmd: 'justifyCenter', title: 'Align Center' },
          { icon: AlignRight,   cmd: 'justifyRight',  title: 'Align Right' },
          { icon: AlignJustify, cmd: 'justifyFull',   title: 'Justify' },
        ].map(({ icon: Icon, cmd, title }) => (
          <button
            key={cmd}
            type="button"
            onMouseDown={e => { e.preventDefault(); exec(cmd) }}
            title={title}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        {/* Highlight Split Button */}
        <div className="relative flex items-center group/highlight">
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              if (activeFormats.highlight) {
                const sel = window.getSelection()
                if (sel && sel.isCollapsed) {
                  // Forcefully break out of the span for the next typed characters
                  exec('insertHTML', '<span style="background-color: transparent;">&#8203;</span>')
                } else {
                  exec('backColor', 'transparent')
                  exec('removeFormat')
                }
              } else {
                exec('backColor', '#FEF08A')
              }
            }}
            title="Stop Highlighting / Clear Format"
            className={`p-1.5 rounded-l transition-colors flex items-center gap-1 ${
              activeFormats.highlight
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setShowHighlights(v => !v) }}
            className={`p-1.5 rounded-r transition-colors border-l border-border/50 ${
              showHighlights ? 'bg-muted text-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <ChevronDown className="w-3 h-3" />
          </button>

          {showHighlights && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-card border border-border rounded-xl shadow-xl z-20 flex flex-col gap-1.5 min-w-[120px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-0.5">Highlight Color</p>
              <div className="grid grid-cols-4 gap-1">
                {HIGHLIGHT_COLORS.map(({ color, label }) => (
                  <button
                    key={color}
                    type="button"
                    title={label}
                    onMouseDown={e => {
                      e.preventDefault()
                      exec('backColor', color === '#ffffff' ? 'transparent' : color)
                      setShowHighlights(false)
                    }}
                    className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  const sel = window.getSelection()
                  if (sel && sel.isCollapsed) {
                    exec('insertHTML', '<span style="background-color: transparent;">&#8203;</span>')
                  } else {
                    exec('backColor', 'transparent')
                    exec('removeFormat')
                  }
                  setShowHighlights(false)
                }}
                className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-500 transition-colors px-1"
              >
                <X className="w-3 h-3" /> Clear Formatting
              </button>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-border mx-1" />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); insertLink() }}
          title="Insert Link"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={checkFormat}
        onMouseUp={checkFormat}
        data-placeholder="Write something…"
        className="w-full outline-none text-foreground text-base leading-relaxed prose prose-sm dark:prose-invert max-w-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pointer-events-none"
      />
    </div>
  )
}
