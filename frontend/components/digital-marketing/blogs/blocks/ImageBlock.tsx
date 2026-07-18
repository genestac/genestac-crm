'use client'

import { useRef, useState } from 'react'
import { UploadCloud, X, LayoutGrid, Square, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import Image from 'next/image'
import { uploadBlogImage } from '@/app/digital-marketing/actions'
import type { ImageData, ImageItem } from '../types'
import { ImageCropperModal } from '../ImageCropperModal'

interface Props {
  data: ImageData
  onChange: (data: ImageData) => void
}

const LAYOUTS: { value: ImageData['layout']; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'single',  label: '1 Col',  icon: Square },
  { value: 'grid-2', label: '2 Cols',  icon: LayoutGrid },
  { value: 'grid-3', label: '3 Cols',  icon: LayoutGrid },
  { value: 'grid-4', label: '4 Cols',  icon: LayoutGrid },
]

const ALIGNS: { value: 'left' | 'center' | 'right'; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'left',   label: 'Left',   icon: AlignLeft },
  { value: 'center', label: 'Center', icon: AlignCenter },
  { value: 'right',  label: 'Right',  icon: AlignRight },
]

const TEXT_SIDES: { value: NonNullable<ImageData['textSide']>; label: string }[] = [
  { value: 'none',  label: 'No Text' },
  { value: 'left',  label: 'Text Left' },
  { value: 'right', label: 'Text Right' },
]

const IMAGE_WIDTHS: { value: NonNullable<ImageData['imageWidth']>; label: string }[] = [
  { value: '33', label: '33% Width' },
  { value: '50', label: '50% Width' },
  { value: '66', label: '66% Width' },
]

export function ImageBlock({ data, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Cropper state
  const [cropperQueue, setCropperQueue] = useState<File[]>([])
  const [cropperSrc, setCropperSrc] = useState<string | null>(null)

  const openCropperForFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const arr = Array.from(files)
    setCropperQueue(arr.slice(1))
    setCropperSrc(URL.createObjectURL(arr[0]))
  }

  const handleCropConfirm = async (blob: Blob) => {
    const src = cropperSrc
    setCropperSrc(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'image.webp')
      const res = await uploadBlogImage(fd)
      const newItem: ImageItem = { url: res.url, alt: '', caption: '' }
      onChange({ ...data, images: [...data.images, newItem] })
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setUploading(false)
      if (src) URL.revokeObjectURL(src)
    }
    // Process next in queue
    if (cropperQueue.length > 0) {
      const next = cropperQueue[0]
      setCropperQueue(q => q.slice(1))
      setCropperSrc(URL.createObjectURL(next))
    }
  }

  const handleCropCancel = () => {
    if (cropperSrc) URL.revokeObjectURL(cropperSrc)
    setCropperSrc(null)
    setCropperQueue([])
  }

  const updateImage = (idx: number, field: keyof ImageItem, value: string) => {
    const updated = data.images.map((img, i) => i === idx ? { ...img, [field]: value } : img)
    onChange({ ...data, images: updated })
  }

  const removeImage = (idx: number) => {
    onChange({ ...data, images: data.images.filter((_, i) => i !== idx) })
  }

  const gridClass: Record<ImageData['layout'], string> = {
    single:  'grid-cols-1',
    'grid-2': 'grid-cols-2',
    'grid-3': 'grid-cols-3',
    'grid-4': 'grid-cols-2 md:grid-cols-4',
  }

  const alignClass = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto'
  }

  return (
    <>
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layout:</span>
        {LAYOUTS.map(layout => (
          <button
            key={layout.value}
            type="button"
            onClick={() => onChange({ ...data, layout: layout.value })}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              data.layout === layout.value
                ? 'bg-violet-600 text-white border-violet-600'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <layout.icon className="w-3 h-3" />
            {layout.label}
          </button>
        ))}

        {data.layout === 'single' && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Align:</span>
            {ALIGNS.map(align => (
              <button
                key={align.value}
                type="button"
                onClick={() => onChange({ ...data, align: align.value, textSide: 'none' })}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  (data.align === align.value || (!data.align && align.value === 'center')) && (!data.textSide || data.textSide === 'none')
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <align.icon className="w-3 h-3" />
                {align.label}
              </button>
            ))}
            
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Side Text:</span>
            {TEXT_SIDES.map(side => (
              <button
                key={side.value}
                type="button"
                onClick={() => onChange({ ...data, textSide: side.value })}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  data.textSide === side.value || (!data.textSide && side.value === 'none')
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {side.label}
              </button>
            ))}

            {data.textSide && data.textSide !== 'none' && (
              <>
                <div className="w-px h-4 bg-border mx-1" />
                {IMAGE_WIDTHS.map(width => (
                  <button
                    key={width.value}
                    type="button"
                    onClick={() => onChange({ ...data, imageWidth: width.value })}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      data.imageWidth === width.value || (!data.imageWidth && width.value === '50')
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {width.label}
                  </button>
                ))}
              </>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          {uploading ? 'Uploading…' : 'Add Image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { openCropperForFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Image Grid */}
      {data.images.length > 0 ? (
        <div className={
          data.layout === 'single' && data.textSide && data.textSide !== 'none'
            ? `flex gap-4 items-start ${data.textSide === 'left' ? 'flex-row-reverse' : 'flex-row'}`
            : `grid gap-3 ${gridClass[data.layout]} ${data.layout === 'single' ? alignClass[data.align || 'center'] + ' max-w-xl' : ''}`
        }>
          <div className={
            data.layout === 'single' && data.textSide && data.textSide !== 'none'
              ? (data.imageWidth === '33' ? 'w-1/3' : data.imageWidth === '66' ? 'w-2/3' : 'w-1/2')
              : 'contents'
          }>
            {data.images.map((img, idx) => (
              <div key={idx} className="group relative rounded-xl overflow-hidden border border-border bg-muted/30 space-y-2 p-2">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={img.url}
                    alt={img.alt}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={img.alt}
                  onChange={e => updateImage(idx, 'alt', e.target.value)}
                  placeholder="Alt text (for accessibility & SEO)"
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <input
                  type="text"
                  value={img.caption}
                  onChange={e => updateImage(idx, 'caption', e.target.value)}
                  placeholder="Caption (optional)"
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            ))}
          </div>

          {data.layout === 'single' && data.textSide && data.textSide !== 'none' && (
            <div className="flex-1">
              <textarea
                value={data.textHtml || ''}
                onChange={e => onChange({ ...data, textHtml: e.target.value })}
                placeholder="Type your text here..."
                className="w-full min-h-[150px] h-full resize-y p-3 text-sm bg-background border border-border rounded-xl outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-12 rounded-xl border-2 border-dashed border-border hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/10 transition-all text-muted-foreground hover:text-violet-600"
        >
          <UploadCloud className="w-8 h-8" />
          <span className="text-sm font-medium">Click to upload image(s)</span>
          <span className="text-xs">PNG, JPG, WebP — each opens cropper</span>
        </button>
      )}
    </div>
      {cropperSrc && (
        <ImageCropperModal
          imageSrc={cropperSrc}
          aspectRatio={null}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  )
}
