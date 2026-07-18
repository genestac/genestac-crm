'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Crop, RotateCcw } from 'lucide-react'

type HandleType = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface Box { x: number; y: number; w: number; h: number }
interface DisplayBounds { x: number; y: number; w: number; h: number }

interface Props {
  imageSrc: string
  aspectRatio?: number | null  // null = free crop
  ratioLabel?: string
  onConfirm: (croppedBlob: Blob) => void
  onCancel: () => void
}

const MIN_SIZE = 40
const HANDLE_SIZE = 12

function getInitialBox(dw: number, dh: number, ar: number | null | undefined): Box {
  if (ar) {
    let w = dw * 0.85
    let h = w / ar
    if (h > dh * 0.85) { h = dh * 0.85; w = h * ar }
    return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
  }
  const w = dw * 0.85
  const h = dh * 0.85
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
}

function clamp(box: Box, dw: number, dh: number): Box {
  let { x, y, w, h } = box
  w = Math.max(MIN_SIZE, Math.min(w, dw))
  h = Math.max(MIN_SIZE, Math.min(h, dh))
  x = Math.max(0, Math.min(x, dw - w))
  y = Math.max(0, Math.min(y, dh - h))
  return { x, y, w, h }
}

export function ImageCropperModal({ imageSrc, aspectRatio, ratioLabel, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgElRef = useRef<HTMLImageElement>(null)

  const [natSize, setNatSize] = useState({ w: 0, h: 0 })
  const [contSize, setContSize] = useState({ w: 0, h: 0 })
  const [bounds, setBounds] = useState<DisplayBounds | null>(null)
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 80, h: 80 })
  const [isProcessing, setIsProcessing] = useState(false)
  const [cursor, setCursor] = useState<string>('default')

  const dragRef = useRef<{
    handle: HandleType
    startX: number; startY: number
    startBox: Box
  } | null>(null)

  // Compute display bounds of the image inside the container
  const computeBounds = useCallback((cw: number, ch: number, nw: number, nh: number): DisplayBounds | null => {
    if (!cw || !ch || !nw || !nh) return null
    const ia = nw / nh
    const ca = cw / ch
    let dw: number, dh: number
    if (ia > ca) { dw = cw; dh = cw / ia }
    else { dh = ch; dw = ch * ia }
    return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh }
  }, [])

  useEffect(() => {
    const b = computeBounds(contSize.w, contSize.h, natSize.w, natSize.h)
    setBounds(b)
    if (b) setBox(getInitialBox(b.w, b.h, aspectRatio))
  }, [contSize, natSize, computeBounds, aspectRatio])

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setNatSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = imageSrc
  }, [imageSrc])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const e = entries[0]
      setContSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Unified drag handler
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !bounds) return
      const { handle, startX, startY, startBox } = dragRef.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const ar = aspectRatio || null

      let { x, y, w, h } = startBox

      if (handle === 'move') {
        x = startBox.x + dx
        y = startBox.y + dy
        setBox(clamp({ x, y, w, h }, bounds.w, bounds.h))
        return
      }

      // Resize handles - use dx as primary for horizontal handles, dy for vertical, diagonal for corners
      if (handle === 'e' || handle === 'ne' || handle === 'se') {
        w = Math.max(MIN_SIZE, startBox.w + dx)
      }
      if (handle === 'w' || handle === 'nw' || handle === 'sw') {
        const newW = Math.max(MIN_SIZE, startBox.w - dx)
        x = startBox.x + (startBox.w - newW)
        w = newW
      }
      if (handle === 's' || handle === 'se' || handle === 'sw') {
        h = Math.max(MIN_SIZE, startBox.h + dy)
      }
      if (handle === 'n' || handle === 'ne' || handle === 'nw') {
        const newH = Math.max(MIN_SIZE, startBox.h - dy)
        y = startBox.y + (startBox.h - newH)
        h = newH
      }

      // Lock aspect ratio if needed
      if (ar) {
        if (handle === 'e' || handle === 'se') { h = w / ar }
        else if (handle === 'w' || handle === 'sw') { h = w / ar }
        else if (handle === 's') { w = h * ar; x = startBox.x + (startBox.w - w) / 2 }
        else if (handle === 'n') { w = h * ar; x = startBox.x + (startBox.w - w) / 2; y = startBox.y + startBox.h - h }
        else if (handle === 'ne') { w = h * ar }
        else if (handle === 'nw') { h = w / ar; y = startBox.y + startBox.h - h }
      }

      setBox(clamp({ x, y, w, h }, bounds.w, bounds.h))
    }

    const onUp = () => { dragRef.current = null }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [bounds, aspectRatio])

  const startDrag = (e: React.MouseEvent, handle: HandleType) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startBox: { ...box } }
    const cursors: Record<HandleType, string> = {
      move: 'grabbing', nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
      e: 'e-resize', se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize'
    }
    setCursor(cursors[handle])
  }

  const getCursorClass = (h: HandleType) => {
    const m: Record<HandleType, string> = {
      move: 'cursor-grab', nw: 'cursor-nw-resize', n: 'cursor-n-resize', ne: 'cursor-ne-resize',
      e: 'cursor-e-resize', se: 'cursor-se-resize', s: 'cursor-s-resize', sw: 'cursor-sw-resize', w: 'cursor-w-resize'
    }
    return m[h]
  }

  const handleConfirm = () => {
    if (!bounds) return
    setIsProcessing(true)

    // Map box coords (in display image space) back to natural image coords
    const scaleX = natSize.w / bounds.w
    const scaleY = natSize.h / bounds.h

    const srcX = Math.round(box.x * scaleX)
    const srcY = Math.round(box.y * scaleY)
    const srcW = Math.round(box.w * scaleX)
    const srcH = Math.round(box.h * scaleY)

    // Output at 2x for retina (max 2400px wide)
    const outW = Math.min(srcW * 2, 2400)
    const outH = Math.round(outW * (srcH / srcW))

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const offscreen = document.createElement('canvas')
      offscreen.width = outW
      offscreen.height = outH
      const ctx = offscreen.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH)
      offscreen.toBlob(blob => {
        if (blob) onConfirm(blob)
        setIsProcessing(false)
      }, 'image/webp', 0.88)
    }
    img.src = imageSrc
  }

  const reset = () => {
    if (bounds) setBox(getInitialBox(bounds.w, bounds.h, aspectRatio))
  }

  const hs = HANDLE_SIZE
  const hOff = -hs / 2

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ cursor }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 flex flex-col bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Crop className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Crop Image</p>
              <p className="text-[11px] text-zinc-400">
                Drag the crop box to move · Drag handles to resize
                {ratioLabel && <> · <span className="text-violet-400 font-semibold">{ratioLabel}</span></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={reset} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" title="Reset">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[320px] max-h-[480px] bg-zinc-950 overflow-hidden select-none"
          onMouseUp={() => setCursor('default')}
        >
          {/* Image */}
          {bounds && (
            <img
              ref={imgElRef}
              src={imageSrc}
              alt="crop"
              draggable={false}
              style={{
                position: 'absolute',
                left: bounds.x,
                top: bounds.y,
                width: bounds.w,
                height: bounds.h,
                objectFit: 'fill',
                userSelect: 'none',
              }}
            />
          )}

          {/* Dark overlays around crop box (4 strips) */}
          {bounds && (
            <>
              {/* Top */}
              <div style={{ position: 'absolute', left: bounds.x, top: bounds.y, width: bounds.w, height: box.y, background: 'rgba(0,0,0,0.6)' }} />
              {/* Bottom */}
              <div style={{ position: 'absolute', left: bounds.x, top: bounds.y + box.y + box.h, width: bounds.w, height: bounds.h - box.y - box.h, background: 'rgba(0,0,0,0.6)' }} />
              {/* Left */}
              <div style={{ position: 'absolute', left: bounds.x, top: bounds.y + box.y, width: box.x, height: box.h, background: 'rgba(0,0,0,0.6)' }} />
              {/* Right */}
              <div style={{ position: 'absolute', left: bounds.x + box.x + box.w, top: bounds.y + box.y, width: bounds.w - box.x - box.w, height: box.h, background: 'rgba(0,0,0,0.6)' }} />

              {/* Crop box */}
              <div
                style={{
                  position: 'absolute',
                  left: bounds.x + box.x,
                  top: bounds.y + box.y,
                  width: box.w,
                  height: box.h,
                  border: '2px solid rgba(255,255,255,0.9)',
                  boxSizing: 'border-box',
                }}
                className={getCursorClass('move')}
                onMouseDown={e => startDrag(e, 'move')}
              >
                {/* Rule of thirds */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {[1/3, 2/3].map(f => (
                    <div key={f} style={{ position: 'absolute', left: `${f*100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.2)' }} />
                  ))}
                  {[1/3, 2/3].map(f => (
                    <div key={f} style={{ position: 'absolute', top: `${f*100}%`, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.2)' }} />
                  ))}
                </div>

                {/* Ratio badge */}
                {ratioLabel && (
                  <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(109,40,217,0.9)', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, color: 'white', letterSpacing: '0.03em', pointerEvents: 'none' }}>
                    {ratioLabel}
                  </div>
                )}

                {/* 8 resize handles */}
                {([
                  ['nw', { left: hOff, top: hOff }],
                  ['n',  { left: '50%', top: hOff, transform: 'translateX(-50%)' }],
                  ['ne', { right: hOff, top: hOff }],
                  ['e',  { right: hOff, top: '50%', transform: 'translateY(-50%)' }],
                  ['se', { right: hOff, bottom: hOff }],
                  ['s',  { left: '50%', bottom: hOff, transform: 'translateX(-50%)' }],
                  ['sw', { left: hOff, bottom: hOff }],
                  ['w',  { left: hOff, top: '50%', transform: 'translateY(-50%)' }],
                ] as [HandleType, React.CSSProperties][]).map(([h, style]) => (
                  <div
                    key={h}
                    className={getCursorClass(h)}
                    onMouseDown={e => startDrag(e, h)}
                    style={{
                      position: 'absolute',
                      width: hs,
                      height: hs,
                      background: 'white',
                      border: '2px solid rgba(109,40,217,0.8)',
                      borderRadius: 2,
                      zIndex: 10,
                      ...style,
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Size info badge */}
          {bounds && (
            <div style={{
              position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 10px',
              fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              {Math.round(box.w / bounds.w * natSize.w)} × {Math.round(box.h / bounds.h * natSize.h)} px
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 shrink-0">
          <p className="text-[11px] text-zinc-500">Drag crop box to move · Drag white handles to resize</p>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-4 py-1.5 text-sm font-semibold text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing || !bounds}
              className="px-5 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
            >
              {isProcessing ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Processing...</>
              ) : (
                <><Crop className="w-3.5 h-3.5" /> Apply Crop</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
