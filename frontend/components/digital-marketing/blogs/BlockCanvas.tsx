'use client'

import { useState, useRef } from 'react'
import {
  Plus, GripVertical, Trash2, ChevronDown, MoveVertical,
  Heading2, Type, Image as ImageIcon, Video, MousePointerClick, Table, Columns, Settings2
} from 'lucide-react'
import { HeadingBlock } from './blocks/HeadingBlock'
import { TextBlock }    from './blocks/TextBlock'
import { ImageBlock }   from './blocks/ImageBlock'
import { VideoBlock }   from './blocks/VideoBlock'
import { CTABlock }     from './blocks/CTABlock'
import { TableBlock }   from './blocks/TableBlock'
import { ColumnsBlock } from './blocks/ColumnsBlock'
import type {
  ContentBlock, BlockType,
  HeadingData, TextData, ImageData, VideoData, CTAData, TableData, ColumnsData,
} from './types'
import { generateBlockId } from './types'

interface Props {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
  disableColumns?: boolean
}

const BLOCK_META: { type: BlockType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { type: 'heading', label: 'Heading',   icon: Heading2 },
  { type: 'text',    label: 'Text',      icon: Type },
  { type: 'image',   label: 'Image',     icon: ImageIcon },
  { type: 'video',   label: 'Video',     icon: Video },
  { type: 'cta',     label: 'CTA Button', icon: MousePointerClick },
  { type: 'table',   label: 'Table',     icon: Table },
  { type: 'columns', label: 'Columns',   icon: Columns },
]

function defaultData(type: BlockType): ContentBlock['data'] {
  switch (type) {
    case 'heading': return { level: 'h2', text: '', id: '', align: 'left' } as HeadingData
    case 'text':    return { html: '' } as TextData
    case 'image':   return { layout: 'single', align: 'center', textSide: 'none', textHtml: '', imageWidth: '50', images: [] } as ImageData
    case 'video':   return { url: '', title: '', transcript: '' } as VideoData
    case 'cta':     return { text: '', href: '', color: '#FFFFFF', bgColor: '#7C3AED', openInNewTab: false } as CTAData
    case 'table':   return { headers: ['Col 1', 'Col 2'], rows: [['', ''], ['', '']] } as TableData
    case 'columns': return { layout: '50-50', columns: [[], []] } as ColumnsData
  }
}

const BLOCK_LABELS: Record<BlockType, string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  video: 'Video',
  cta: 'CTA Button',
  table: 'Table',
  columns: 'Columns Layout',
}

export function BlockCanvas({ blocks, onChange, disableColumns }: Props) {
  const [showAddMenu, setShowAddMenu] = useState<number | null>(null) // insert AFTER this index, -1 = top
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver]   = useState<number | null>(null)
  const [showSpacingMenu, setShowSpacingMenu] = useState<string | null>(null)
  const [showGlobalMenu, setShowGlobalMenu] = useState(false)

  const availableBlocks = disableColumns ? BLOCK_META.filter(b => b.type !== 'columns') : BLOCK_META

  const addBlock = (type: BlockType, afterIndex: number) => {
    const newBlock: ContentBlock = { id: generateBlockId(), type, data: defaultData(type) }
    const updated = [...blocks]
    updated.splice(afterIndex + 1, 0, newBlock)
    onChange(updated)
    setShowAddMenu(null)
  }

  const updateBlock = (id: string, data: ContentBlock['data']) => {
    onChange(blocks.map(b => b.id === id ? { ...b, data } : b))
  }

  const updateBlockSpacing = (id: string, spacing: ContentBlock['spacing']) => {
    onChange(blocks.map(b => b.id === id ? { ...b, spacing: { ...b.spacing, ...spacing } } : b))
  }

  const deleteBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id))
    if (showSpacingMenu === id) setShowSpacingMenu(null)
  }

  const setGlobalTextSize = (size: string) => {
    onChange(blocks.map(b => {
      if (b.type === 'text') {
        return { ...b, data: { ...b.data, baseFontSize: size } as TextData }
      }
      return b
    }))
  }

  // Drag-and-drop reorder
  const handleDrop = (targetIdx: number) => {
    if (dragging === null || dragging === targetIdx) return
    const updated = [...blocks]
    const [removed] = updated.splice(dragging, 1)
    updated.splice(targetIdx, 0, removed)
    onChange(updated)
    setDragging(null)
    setDragOver(null)
  }

  return (
    <div className="space-y-2">
      {/* Global Toolbar */}
      {blocks.length > 0 && (
        <div className="flex justify-end mb-4 relative z-50">
          <div className="relative">
            <button 
              type="button" 
              onClick={() => setShowGlobalMenu(!showGlobalMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground"
            >
              <Type className="w-3.5 h-3.5" />
              Set All Text Sizes
              <ChevronDown className="w-3 h-3" />
            </button>
            {showGlobalMenu && (
              <div className="absolute top-full right-0 mt-1 flex flex-col bg-card border border-border rounded-xl shadow-xl z-[60] py-1 min-w-[180px]">
                <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">Global Base Size</div>
                {[
                  { size: 'text-sm prose-sm', label: 'Small' },
                  { size: 'text-base prose-base', label: 'Medium' },
                  { size: 'text-lg prose-lg', label: 'Large (Medium.com)' },
                  { size: 'text-xl prose-xl', label: 'Extra Large' },
                ].map(({ size, label }) => (
                  <button
                    key={size}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault()
                      setGlobalTextSize(size)
                      setShowGlobalMenu(false)
                    }}
                    className="px-4 py-2 text-left text-sm hover:bg-muted transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {blocks.length === 0 && (
        <div className={`text-center rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10 ${disableColumns ? 'py-6' : 'py-16'}`}>
          <Plus className={`${disableColumns ? 'w-6 h-6' : 'w-10 h-10'} mx-auto text-violet-300 mb-2`} />
          <p className={`font-semibold text-foreground ${disableColumns ? 'text-sm' : 'text-base'}`}>
            {disableColumns ? 'Empty column' : 'Start building your post'}
          </p>
          {!disableColumns && (
            <p className="text-sm text-muted-foreground mt-1">Click the + button below to add your first block</p>
          )}
        </div>
      )}

      {blocks.map((block, idx) => (
        <div key={block.id}>
          {/* Drop zone indicator */}
          {dragOver === idx && dragging !== null && dragging !== idx && (
            <div className="h-1 bg-violet-500 rounded-full my-1 transition-all" />
          )}

          <div
            draggable
            onDragStart={() => setDragging(idx)}
            onDragEnd={() => { setDragging(null); setDragOver(null) }}
            onDragOver={e => { e.preventDefault(); setDragOver(idx) }}
            onDrop={() => handleDrop(idx)}
            style={{ 
              marginTop: block.spacing?.marginTop || undefined,
              marginBottom: block.spacing?.marginBottom || undefined,
            }}
            className={`group relative bg-card border rounded-2xl p-5 transition-all duration-200 ${
              dragging === idx
                ? 'opacity-40 border-violet-400 shadow-lg scale-[0.99]'
                : 'border-border hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-sm'
            }`}
          >
            {/* Block type pill */}
            <div className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider text-violet-400 select-none opacity-0 group-hover:opacity-100 transition-opacity">
              {BLOCK_LABELS[block.type]}
            </div>

            {/* Controls */}
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setShowAddMenu(showAddMenu === idx ? null : idx)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Add block below"
              >
                <Plus className="w-4 h-4" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSpacingMenu(showSpacingMenu === block.id ? null : block.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Spacing Settings"
                >
                  <MoveVertical className="w-4 h-4" />
                </button>
                {showSpacingMenu === block.id && (
                  <div className="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-xl shadow-xl p-3 z-30">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Spacing (Margins)</p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground">Top Spacing</label>
                        <select 
                          value={block.spacing?.marginTop || ''} 
                          onChange={e => updateBlockSpacing(block.id, { marginTop: e.target.value })}
                          className="w-full mt-1 text-sm bg-background border border-border rounded-md px-2 py-1"
                        >
                          <option value="">Default</option>
                          <option value="0">Remove (0px)</option>
                          <option value="-1rem">Negative (-1rem)</option>
                          <option value="-2rem">Negative (-2rem)</option>
                          <option value="-3rem">Negative (-3rem)</option>
                          <option value="1rem">Small (1rem)</option>
                          <option value="2rem">Medium (2rem)</option>
                          <option value="4rem">Large (4rem)</option>
                          <option value="8rem">Massive (8rem)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground">Bottom Spacing</label>
                        <select 
                          value={block.spacing?.marginBottom || ''} 
                          onChange={e => updateBlockSpacing(block.id, { marginBottom: e.target.value })}
                          className="w-full mt-1 text-sm bg-background border border-border rounded-md px-2 py-1"
                        >
                          <option value="">Default</option>
                          <option value="0">Remove (0px)</option>
                          <option value="-1rem">Negative (-1rem)</option>
                          <option value="-2rem">Negative (-2rem)</option>
                          <option value="-3rem">Negative (-3rem)</option>
                          <option value="1rem">Small (1rem)</option>
                          <option value="2rem">Medium (2rem)</option>
                          <option value="4rem">Large (4rem)</option>
                          <option value="8rem">Massive (8rem)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <GripVertical className="w-4 h-4" />
              </div>
              <button
                type="button"
                onClick={() => deleteBlock(block.id)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors"
                title="Delete block"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Block renderer */}
            <div className="pt-4">
              {block.type === 'heading' && (
                <HeadingBlock
                  data={block.data as HeadingData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
              {block.type === 'text' && (
                <TextBlock
                  data={block.data as TextData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
              {block.type === 'image' && (
                <ImageBlock
                  data={block.data as ImageData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
              {block.type === 'video' && (
                <VideoBlock
                  data={block.data as VideoData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
              {block.type === 'cta' && (
                <CTABlock
                  data={block.data as CTAData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
              {block.type === 'table' && (
                <TableBlock
                  data={block.data as TableData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
              {block.type === 'columns' && (
                <ColumnsBlock
                  data={block.data as ColumnsData}
                  onChange={d => updateBlock(block.id, d)}
                />
              )}
            </div>

            {/* Inline Add-Block Menu */}
            {showAddMenu === idx && (
              <div className="mt-4 pt-4 border-t border-dashed border-border">
                <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Add block below</p>
                <div className="flex flex-wrap gap-2">
                  {availableBlocks.map(meta => (
                    <button
                      key={meta.type}
                      type="button"
                      onClick={() => addBlock(meta.type, idx)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-background hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all"
                    >
                      <meta.icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Add block at end */}
      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setShowAddMenu(showAddMenu === -99 ? null : -99)}
          className={`w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/10 text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 font-medium transition-all group ${disableColumns ? 'py-2 text-xs' : 'py-3 text-sm'}`}
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
          {disableColumns ? 'Add Block' : 'Add Block'}
        </button>
        {showAddMenu === -99 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-card border border-border rounded-2xl shadow-xl p-4 z-20">
            <p className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">Choose block type</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {availableBlocks.map(meta => (
                <button
                  key={meta.type}
                  type="button"
                  onClick={() => addBlock(meta.type, blocks.length - 1)}
                  className="flex flex-col items-center gap-2 px-3 py-3 text-xs font-medium rounded-xl border border-border bg-background hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all"
                >
                  <meta.icon className="w-5 h-5" />
                  {meta.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
