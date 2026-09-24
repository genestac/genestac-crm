'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  Dumbbell, Plus, Search, Filter, Edit2, Trash2, Play, Upload,
  ChevronDown, X, Check, Video, Image as ImageIcon, Clock,
  Flame, Wind, Heart, Leaf, Zap, Activity, BarChart3,
  ToggleLeft, ToggleRight, AlertCircle, Loader2, Eye, EyeOff,
  BookOpen, Tag, RefreshCw, ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const PROXY = '/api/proxy/exercises'

// ─── Types ─────────────────────────────────────────────────────────────────────

type ExType   = 'exercise' | 'yoga'
type Difficulty = 'beginner' | 'intermediate' | 'advanced'
type PageTab  = 'library' | 'add'

interface Exercise {
  id: string
  title: string
  description?: string
  category: string
  type: ExType
  difficulty: Difficulty
  duration_minutes?: number
  video_url?: string
  thumbnail_url?: string
  tags?: string[]
  instructions?: string
  benefits?: string[]
  equipment_needed?: string
  is_active: boolean
  created_at: string
  updated_at?: string
}

interface Stats {
  total: number
  active: number
  yoga: number
  exercises: number
  by_category: Record<string, number>
}

// ─── Config ─────────────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'yoga',         label: 'Yoga',             icon: Leaf,     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'strength',     label: 'Strength Training', icon: Dumbbell, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'cardio',       label: 'Cardio',            icon: Flame,    color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'stretching',   label: 'Stretching',        icon: Activity, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'breathing',    label: 'Breathing',         icon: Wind,     color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { value: 'meditation',   label: 'Meditation',        icon: Heart,    color: 'bg-purple-100 text-purple-700 border-purple-200' },
]

const DIFFICULTIES: { value: Difficulty; label: string; color: string }[] = [
  { value: 'beginner',     label: 'Beginner',     color: 'bg-green-100 text-green-700' },
  { value: 'intermediate', label: 'Intermediate', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'advanced',     label: 'Advanced',     color: 'bg-red-100 text-red-700' },
]

function getCategoryConfig(value: string) {
  return CATEGORIES.find(c => c.value === value) ?? { label: value, icon: Dumbbell, color: 'bg-gray-100 text-gray-700 border-gray-200' }
}

function getDifficultyConfig(value: string) {
  return DIFFICULTIES.find(d => d.value === value) ?? { label: value, color: 'bg-gray-100 text-gray-700' }
}

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Video Player Modal ─────────────────────────────────────────────────────────

function VideoModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <p className="text-white font-semibold mb-2 text-center">{title}</p>
        <video
          src={url}
          controls
          autoPlay
          className="w-full rounded-xl bg-black max-h-[70vh]"
        />
      </div>
    </div>
  )
}

// ─── Exercise Card ──────────────────────────────────────────────────────────────

function ExerciseCard({
  ex,
  onEdit,
  onDelete,
  onToggle,
  onPlay,
}: {
  ex: Exercise
  onEdit: (e: Exercise) => void
  onDelete: (id: string) => void
  onToggle: (id: string, current: boolean) => void
  onPlay: (ex: Exercise) => void
}) {
  const cat = getCategoryConfig(ex.category)
  const diff = getDifficultyConfig(ex.difficulty)
  const CatIcon = cat.icon

  return (
    <div className={`group bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${!ex.is_active ? 'opacity-60' : ''}`}>
      {/* Thumbnail / Video Preview */}
      <div className="relative h-44 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        {ex.thumbnail_url ? (
          <img
            src={ex.thumbnail_url}
            alt={ex.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <CatIcon className="w-16 h-16 text-gray-300" />
          </div>
        )}

        {/* Play button overlay if video exists */}
        {ex.video_url && (
          <button
            onClick={() => onPlay(ex)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="w-6 h-6 text-gray-900 ml-1" />
            </div>
          </button>
        )}

        {/* Active toggle badge */}
        <button
          onClick={() => onToggle(ex.id, ex.is_active)}
          className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm hover:bg-white transition-colors"
          title={ex.is_active ? 'Deactivate' : 'Activate'}
        >
          {ex.is_active
            ? <Eye className="w-4 h-4 text-green-600" />
            : <EyeOff className="w-4 h-4 text-gray-400" />
          }
        </button>

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${ex.type === 'yoga' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
            {ex.type === 'yoga' ? '🧘 Yoga' : '💪 Exercise'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{ex.title}</h3>
        </div>

        {ex.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{ex.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cat.color}`}>
            {cat.label}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${diff.color}`}>
            {diff.label}
          </span>
          {ex.duration_minutes && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" /> {ex.duration_minutes} min
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => onEdit(ex)}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 py-1.5 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <button
            onClick={() => onDelete(ex.id)}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add / Edit Form ────────────────────────────────────────────────────────────

function ExerciseForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Exercise | null
  onSave: () => void
  onCancel: () => void
}) {
  const isEdit = !!initial

  const [title, setTitle]           = useState(initial?.title ?? '')
  const [description, setDesc]      = useState(initial?.description ?? '')
  const [category, setCategory]     = useState(initial?.category ?? 'yoga')
  const [type, setType]             = useState<ExType>(initial?.type ?? 'yoga')
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'beginner')
  const [duration, setDuration]     = useState<string>(initial?.duration_minutes?.toString() ?? '')
  const [videoUrl, setVideoUrl]     = useState(initial?.video_url ?? '')
  const [thumbUrl, setThumbUrl]     = useState(initial?.thumbnail_url ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [tagInput, setTagInput]     = useState('')
  const [tags, setTags]             = useState<string[]>(initial?.tags ?? [])
  const [benefits, setBenefits]     = useState<string>(initial?.benefits?.join('\n') ?? '')
  const [equipment, setEquipment]   = useState(initial?.equipment_needed ?? '')
  const [isActive, setIsActive]     = useState(initial?.is_active ?? true)

  const [uploadingVideo, setUploadingVideo]   = useState(false)
  const [uploadingThumb, setUploadingThumb]   = useState(false)
  const [isDraggingThumb, setIsDraggingThumb] = useState(false)
  const [videoProgress, setVideoProgress]     = useState(0)
  const [saving, setSaving]                   = useState(false)

  const videoRef = useRef<HTMLInputElement>(null)
  const thumbRef = useRef<HTMLInputElement>(null)

  // Simulate progress animation for uploads
  const animateProgress = useCallback((setter: (v: number) => void) => {
    setter(0)
    let p = 0
    const iv = setInterval(() => {
      p += Math.random() * 12
      if (p >= 90) { clearInterval(iv) }
      setter(Math.min(p, 90))
    }, 300)
    return () => clearInterval(iv)
  }, [])

  const uploadVideo = useCallback(async (file: File) => {
    setUploadingVideo(true)
    const stop = animateProgress(setVideoProgress)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/proxy/exercises/upload-video', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.detail || 'Video upload failed')
      setVideoUrl(data.url)
      if (data.thumbnail_url && !thumbUrl) setThumbUrl(data.thumbnail_url)
      setVideoProgress(100)
      toast.success('Video uploaded successfully!')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      stop()
      setUploadingVideo(false)
    }
  }, [animateProgress, thumbUrl])

  const uploadThumbnail = useCallback(async (file: File) => {
    setUploadingThumb(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/proxy/exercises/upload-thumbnail', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.detail || 'Thumbnail upload failed')
      setThumbUrl(data.url)
      toast.success('Thumbnail uploaded!')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploadingThumb(false)
    }
  }, [])

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t))

  const handleSave = async () => {
    if (!title.trim()) return toast.error('Title is required')
    if (!category) return toast.error('Category is required')

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        type,
        difficulty,
        duration_minutes: duration ? parseInt(duration) : undefined,
        video_url: videoUrl || undefined,
        thumbnail_url: thumbUrl || undefined,
        instructions: instructions.trim() || undefined,
        tags: tags.length ? tags : undefined,
        benefits: benefits.trim() ? benefits.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        equipment_needed: equipment.trim() || undefined,
        is_active: isActive,
      }

      const url = isEdit ? `${PROXY}?id=${initial!.id}` : PROXY
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Save failed')
      toast.success(isEdit ? 'Exercise updated!' : 'Exercise created!')
      onSave()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Exercise' : 'Add New Exercise / Yoga'}</h2>
          <p className="text-sm text-muted-foreground">Fill in the details below to {isEdit ? 'update' : 'create'} a video content entry</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left — Main Info */}
        <div className="xl:col-span-2 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Title <span className="text-red-500">*</span></label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Surya Namaskar — Full Sun Salutation"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Brief overview of this exercise or yoga routine..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none transition"
                />
              </div>

              {/* Type & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Type <span className="text-red-500">*</span></label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as ExType)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition"
                  >
                    <option value="yoga">🧘 Yoga</option>
                    <option value="exercise">💪 Exercise</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Category <span className="text-red-500">*</span></label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Difficulty & Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={e => setDifficulty(e.target.value as Difficulty)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition"
                  >
                    {DIFFICULTIES.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Duration (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                  />
                </div>
              </div>

              {/* Equipment */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Equipment Needed</label>
                <input
                  value={equipment}
                  onChange={e => setEquipment(e.target.value)}
                  placeholder="e.g. Yoga mat, Resistance band (or leave blank for none)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                    placeholder="Add tag and press Enter"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                  />
                  <button onClick={addTag} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors">
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <span key={t} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                        {t}
                        <button onClick={() => removeTag(t)} className="hover:text-red-600 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Instructions & Benefits */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Instructions & Benefits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Step-by-step Instructions</label>
                <textarea
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="1. Start in a standing position...&#10;2. Inhale and raise your arms..."
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none transition font-mono"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Health Benefits <span className="text-xs text-muted-foreground">(one per line)</span></label>
                <textarea
                  value={benefits}
                  onChange={e => setBenefits(e.target.value)}
                  placeholder="Improves flexibility&#10;Reduces stress&#10;Strengthens core muscles"
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none transition"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right — Media & Publish */}
        <div className="space-y-4">
          {/* Video Upload */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-600" /> Video
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/avi" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadVideo(e.target.files[0]) }} />

              {videoUrl ? (
                <div className="space-y-2">
                  <video src={videoUrl} controls className="w-full rounded-lg max-h-48 bg-black" />
                  <button
                    onClick={() => { setVideoUrl(''); setVideoProgress(0) }}
                    className="w-full text-xs text-red-500 hover:text-red-700 flex items-center justify-center gap-1 py-1"
                  >
                    <X className="w-3.5 h-3.5" /> Remove video
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => videoRef.current?.click()}
                  disabled={uploadingVideo}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors disabled:opacity-50"
                >
                  {uploadingVideo ? (
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-600">
                    {uploadingVideo ? 'Uploading...' : 'Click to upload video'}
                  </span>
                  <span className="text-xs text-muted-foreground">MP4, WebM, MOV, AVI</span>
                </button>
              )}

              {/* Progress bar */}
              {uploadingVideo && (
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
              )}

              {/* Manual URL input */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">or paste video URL</label>
                <input
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>
            </CardContent>
          </Card>

          {/* Thumbnail Upload */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-600" /> Thumbnail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input ref={thumbRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={e => { if (e.target.files?.[0]) uploadThumbnail(e.target.files[0]) }} />

              {thumbUrl ? (
                <div className="space-y-2">
                  <img src={thumbUrl} alt="Thumbnail" className="w-full rounded-lg object-cover h-36" />
                  <button
                    onClick={() => setThumbUrl('')}
                    className="w-full text-xs text-red-500 hover:text-red-700 flex items-center justify-center gap-1 py-1"
                  >
                    <X className="w-3.5 h-3.5" /> Remove thumbnail
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => thumbRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingThumb(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingThumb(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingThumb(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) uploadThumbnail(file);
                  }}
                  disabled={uploadingThumb}
                  className={`w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 transition-colors disabled:opacity-50 ${isDraggingThumb ? 'border-emerald-500 bg-emerald-100' : 'border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50'}`}
                >
                  {uploadingThumb ? (
                    <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
                  ) : (
                    <ImageIcon className="w-7 h-7 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-600">
                    {uploadingThumb ? 'Uploading...' : 'Click or drag to upload thumbnail'}
                  </span>
                  <span className="text-xs text-muted-foreground">JPG, PNG, WebP · 640×360px ideal</span>
                </button>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">or paste image URL</label>
                <input
                  value={thumbUrl}
                  onChange={e => setThumbUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>
            </CardContent>
          </Card>

          {/* Publish Settings */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Publish Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => setIsActive(!isActive)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">Status</p>
                  <p className="text-xs text-muted-foreground">{isActive ? 'Visible in the app' : 'Hidden from users'}</p>
                </div>
                {isActive
                  ? <ToggleRight className="w-6 h-6 text-green-500" />
                  : <ToggleLeft className="w-6 h-6 text-gray-400" />
                }
              </button>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              {isEdit ? 'Save Changes' : 'Create Exercise'}
            </Button>
            <Button variant="outline" onClick={onCancel} className="w-full">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const [tab, setTab]                 = useState<PageTab>('library')
  const [exercises, setExercises]     = useState<Exercise[]>([])
  const [stats, setStats]             = useState<Stats | null>(null)
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [filterCat, setFilterCat]     = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterDiff, setFilterDiff]   = useState('')
  const [page, setPage]               = useState(1)
  const [total, setTotal]             = useState(0)
  const [editTarget, setEditTarget]   = useState<Exercise | null>(null)
  const [videoModal, setVideoModal]   = useState<Exercise | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

  const LIMIT = 20

  const fetchExercises = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      })
      if (search) params.set('search', search)
      if (filterCat) params.set('category', filterCat)
      if (filterType) params.set('type', filterType)
      if (filterDiff) params.set('difficulty', filterDiff)

      const res = await fetch(`${PROXY}?${params.toString()}`)
      const data = await res.json()
      setExercises(data.exercises ?? [])
      setTotal(data.total ?? 0)
    } catch {
      toast.error('Failed to load exercises')
    } finally {
      setLoading(false)
    }
  }, [page, search, filterCat, filterType, filterDiff])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${PROXY}?endpoint=stats`)
      const data = await res.json()
      setStats(data)
    } catch {}
  }, [])

  useEffect(() => { fetchExercises(); fetchStats() }, [fetchExercises, fetchStats])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, filterCat, filterType, filterDiff])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this exercise? This cannot be undone.')) return
    setDeleting(id)
    try {
      const res = await fetch(`${PROXY}?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Delete failed')
      toast.success('Exercise deleted')
      fetchExercises()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeleting(null)
    }
  }

  const handleToggle = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`${PROXY}?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      toast.success(current ? 'Exercise hidden' : 'Exercise activated')
      fetchExercises()
      fetchStats()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleEdit = (ex: Exercise) => {
    setEditTarget(ex)
    setTab('add')
  }

  const handleFormSave = () => {
    setTab('library')
    setEditTarget(null)
    fetchExercises()
    fetchStats()
  }

  const handleFormCancel = () => {
    setTab('library')
    setEditTarget(null)
  }

  const totalPages = Math.ceil(total / LIMIT)

  // ── Render ──────────────────────────────────────────────────────────────────

  if (tab === 'add') {
    return (
      <div className="max-w-6xl mx-auto">
        <ExerciseForm
          initial={editTarget}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
            <Dumbbell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Exercises & Yoga</h1>
            <p className="text-sm text-muted-foreground">Manage video-based workout and yoga content for your users</p>
          </div>
        </div>
        <Button
          onClick={() => { setEditTarget(null); setTab('add') }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Exercise
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Content" value={stats.total} icon={BookOpen} color="bg-indigo-100 text-indigo-600" />
          <StatCard label="Active"        value={stats.active} icon={Activity} color="bg-green-100 text-green-600" />
          <StatCard label="Yoga Sessions" value={stats.yoga}  icon={Leaf}     color="bg-emerald-100 text-emerald-600" />
          <StatCard label="Exercises"     value={stats.exercises} icon={Dumbbell} color="bg-orange-100 text-orange-600" />
        </div>
      )}

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search exercises..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
              />
            </div>

            {/* Category Filter */}
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[140px]"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[120px]"
            >
              <option value="">All Types</option>
              <option value="yoga">Yoga</option>
              <option value="exercise">Exercise</option>
            </select>

            {/* Difficulty Filter */}
            <select
              value={filterDiff}
              onChange={e => setFilterDiff(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[130px]"
            >
              <option value="">All Levels</option>
              {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>

            <button
              onClick={() => { setSearch(''); setFilterCat(''); setFilterType(''); setFilterDiff('') }}
              className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Clear filters"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : exercises.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Dumbbell className="w-16 h-16 text-gray-200 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No exercises found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {search || filterCat || filterType || filterDiff
              ? 'Try clearing your filters'
              : 'Get started by adding your first exercise or yoga video'}
          </p>
          <Button onClick={() => { setEditTarget(null); setTab('add') }} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Add First Exercise
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {exercises.map(ex => (
              <ExerciseCard
                key={ex.id}
                ex={ex}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onPlay={setVideoModal}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground px-2">
                Page {page} of {totalPages} · {total} total
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Video Modal */}
      {videoModal?.video_url && (
        <VideoModal
          url={videoModal.video_url}
          title={videoModal.title}
          onClose={() => setVideoModal(null)}
        />
      )}
    </div>
  )
}
