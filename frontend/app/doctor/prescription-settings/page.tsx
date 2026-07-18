'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Save, Upload, Trash2, Plus, X, FileText,
  Phone, Award, Hash, MessageSquare, Calendar, Stethoscope,
} from 'lucide-react'

const DEFAULT_ADVICE = [
  'Maintain a balanced, calorie-deficit diet as discussed.',
  'Ensure adequate hydration (at least 2.5 – 3 liters of water daily).',
  'Incorporate 30 minutes of light to moderate exercise 5 days a week.',
  'Follow up immediately if you experience any severe side effects.',
]

export default function PrescriptionSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sigUploading, setSigUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const sigRef = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState({
    qualification:     'MBBS, MD',
    reg_number:        '',
    show_phone:        true,
    signature_url:     '',
    advice_lines:      [...DEFAULT_ADVICE],
    followup_text:     'Review after 4 Weeks or earlier if required.',
    consultation_type: 'Online',
  })

  useEffect(() => {
    fetch('/api/proxy/doctor/prescription-settings')
      .then(r => r.json())
      .then(res => {
        if (res && Object.keys(res).length > 0) {
          setSettings(prev => ({
            ...prev,
            ...res,
            advice_lines: res.advice_lines || [...DEFAULT_ADVICE],
          }))
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const update = (key: string, val: any) => setSettings(prev => ({ ...prev, [key]: val }))

  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/proxy/doctor/prescription-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const uploadSignature = async (file: File) => {
    setSigUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/doctor/prescription-settings-signature', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || 'Upload failed')
      update('signature_url', json.signature_url)
    } catch (e: any) {
      alert(`Signature upload failed: ${e.message}`)
    } finally {
      setSigUploading(false)
    }
  }

  const adviceUpdate = (i: number, val: string) => {
    const lines = [...settings.advice_lines]
    lines[i] = val
    update('advice_lines', lines)
  }
  const adviceRemove = (i: number) => update('advice_lines', settings.advice_lines.filter((_: any, j: number) => j !== i))
  const adviceAdd    = ()          => update('advice_lines', [...settings.advice_lines, ''])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Prescription Settings</h1>
            <p className="text-sm text-muted-foreground">Customize how your prescriptions look and what they include.</p>
          </div>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-xl transition-colors shadow-sm"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* ── Doctor Identity ── */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-foreground border-b border-border pb-3">
          <Stethoscope className="w-4 h-4 text-teal-600" />
          Doctor Identity
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              <Award className="w-3 h-3" /> Qualifications
            </label>
            <input
              type="text"
              value={settings.qualification}
              onChange={e => update('qualification', e.target.value)}
              placeholder="e.g. MBBS, MD, DM"
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              <Hash className="w-3 h-3" /> Medical Registration No.
            </label>
            <input
              type="text"
              value={settings.reg_number}
              onChange={e => update('reg_number', e.target.value)}
              placeholder="e.g. MH/123456"
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              <MessageSquare className="w-3 h-3" /> Consultation Type
            </label>
            <select
              value={settings.consultation_type}
              onChange={e => update('consultation_type', e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-teal-500/50"
            >
              <option>Online</option>
              <option>In-Clinic</option>
              <option>Teleconsult</option>
              <option>Home Visit</option>
            </select>
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-3 cursor-pointer mt-5">
              <div
                onClick={() => update('show_phone', !settings.show_phone)}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.show_phone ? 'bg-teal-500' : 'bg-muted'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.show_phone ? 'translate-x-5' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-teal-600" /> Show phone on prescription
                </p>
                <p className="text-xs text-muted-foreground">{settings.show_phone ? 'Phone number visible' : 'Phone number hidden'}</p>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* ── Signature ── */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-foreground border-b border-border pb-3">
          <Award className="w-4 h-4 text-teal-600" />
          Digital Signature
        </div>
        <p className="text-xs text-muted-foreground">Upload your signature image — it will appear above the signature line in all PDFs.</p>

        <div className="flex items-start gap-5">
          {/* Preview */}
          <div className="w-48 h-24 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
            {settings.signature_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.signature_url} alt="Signature" className="max-h-full max-w-full object-contain p-2" />
            ) : (
              <p className="text-xs text-muted-foreground text-center px-3">No signature uploaded</p>
            )}
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => sigRef.current?.click()}
              disabled={sigUploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-60"
            >
              {sigUploading
                ? <div className="w-4 h-4 border-2 border-teal-600/40 border-t-teal-600 rounded-full animate-spin" />
                : <Upload className="w-4 h-4" />}
              {sigUploading ? 'Uploading…' : 'Upload Signature'}
            </button>
            {settings.signature_url && (
              <button
                onClick={() => update('signature_url', '')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Remove
              </button>
            )}
            <input
              ref={sigRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadSignature(e.target.files[0]); e.target.value = '' }}
            />
            <p className="text-xs text-muted-foreground">PNG or JPG with transparent background recommended</p>
          </div>
        </div>
      </section>

      {/* ── Advice Lines ── */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-base font-bold text-foreground">
            <MessageSquare className="w-4 h-4 text-teal-600" />
            Doctor&apos;s Advice Bullets
          </div>
          <button
            onClick={adviceAdd}
            disabled={settings.advice_lines.length >= 6}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-teal-400 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Add Line
          </button>
        </div>
        <p className="text-xs text-muted-foreground">These bullet points appear in the &quot;Doctor&apos;s Advice&quot; section of every prescription.</p>
        <div className="space-y-2">
          {settings.advice_lines.map((line: string, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-teal-600 font-bold text-sm w-4 flex-shrink-0">•</span>
              <input
                type="text"
                value={line}
                onChange={e => adviceUpdate(i, e.target.value)}
                className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-teal-500/50"
              />
              <button onClick={() => adviceRemove(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Follow-up text ── */}
      <section className="bg-card border border-border rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-base font-bold text-foreground border-b border-border pb-3">
          <Calendar className="w-4 h-4 text-teal-600" />
          Follow-up Text
        </div>
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Next Follow-up Note (appears at the bottom of advice section)
        </label>
        <input
          type="text"
          value={settings.followup_text}
          onChange={e => update('followup_text', e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-teal-500/50"
        />
      </section>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-xl transition-colors"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save All Settings'}
        </button>
      </div>
    </div>
  )
}
