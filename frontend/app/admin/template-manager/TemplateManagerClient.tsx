'use client'

import { useState, useEffect, useCallback } from 'react'
import { updateTemplateTrigger, syncMetaTemplates, getTemplateTriggers } from './actions'
import {
  Webhook, RefreshCw, Save, CheckCircle, XCircle,
  ChevronDown, Eye, EyeOff, Zap, AlertCircle, Info
} from 'lucide-react'

interface Field { field: string; label: string; example: string }
interface VarMap { position: number; field: string; label: string }
interface Template {
  id: string; name: string; content: string; status: string
  language: string; default_components: any[]
}
interface Trigger {
  id: string; trigger_key: string; trigger_label: string
  template_id: string | null; template: Template | null
  variable_map: VarMap[]; available_fields: Field[]; is_active: boolean
}
interface PageData { triggers: Trigger[]; all_templates: Template[] }

const TRIGGER_ICONS: Record<string, string> = {
  appointment_new_request:        '🔔',
  appointment_confirmed_patient:  '✅',
  appointment_reminder_10min:     '⏰',
  crm_daily_status_update:        '📊',
}

// Parse {{N}} vars from template content
function extractVars(content: string): number[] {
  const matches = content.matchAll(/\{\{(\d+)\}\}/g)
  const positions = new Set<number>()
  for (const m of matches) positions.add(parseInt(m[1]))
  return Array.from(positions).sort((a, b) => a - b)
}

// Substitute example values into template content
function previewContent(content: string, varMap: VarMap[], fields: Field[]): string {
  let preview = content
  for (const mapping of varMap) {
    const fieldMeta = fields.find(f => f.field === mapping.field)
    const example = fieldMeta?.example || `[${mapping.field}]`
    preview = preview.replaceAll(`{{${mapping.position}}}`, `*${example}*`)
  }
  // Remove remaining placeholders with grey text indicator
  preview = preview.replace(/\{\{(\d+)\}\}/g, '[not mapped]')
  return preview
}

function TriggerCard({
  trigger,
  allTemplates,
  onSaved,
}: {
  trigger: Trigger
  allTemplates: Template[]
  onSaved: () => void
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(trigger.template_id || '')
  const [varMap, setVarMap] = useState<VarMap[]>(trigger.variable_map || [])
  const [isActive, setIsActive] = useState(trigger.is_active)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  // When template changes, auto-populate variable_map based on available fields
  const handleTemplateChange = (newId: string) => {
    setSelectedTemplateId(newId)
    const tpl = allTemplates.find(t => t.id === newId)
    if (!tpl) { setVarMap([]); return }

    const content = tpl.content || ''
    const positions = extractVars(content)
    const fields = trigger.available_fields

    // Auto-map: match by position order (field at index i → position i+1)
    const autoMap: VarMap[] = positions.map((pos, idx) => {
      const existingMapping = varMap.find(v => v.position === pos)
      const fieldMeta = fields[idx] || null
      return {
        position: pos,
        field: existingMapping?.field || fieldMeta?.field || '',
        label: existingMapping?.label || fieldMeta?.label || '',
      }
    })
    setVarMap(autoMap)
  }

  const handleFieldChange = (position: number, newField: string) => {
    const fieldMeta = trigger.available_fields.find(f => f.field === newField)
    setVarMap(prev =>
      prev.map(v => v.position === position
        ? { ...v, field: newField, label: fieldMeta?.label || newField }
        : v
      )
    )
  }

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await updateTemplateTrigger(
        trigger.trigger_key,
        selectedTemplateId || null,
        varMap,
        isActive,
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      onSaved()
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId) || trigger.template
  const content = selectedTemplate?.content || ''
  const positions = extractVars(content)
  const preview = selectedTemplate ? previewContent(content, varMap, trigger.available_fields) : ''

  const isChanged =
    selectedTemplateId !== (trigger.template_id || '') ||
    JSON.stringify(varMap) !== JSON.stringify(trigger.variable_map) ||
    isActive !== trigger.is_active

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${isActive ? 'border-slate-200' : 'border-gray-200 opacity-70'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{TRIGGER_ICONS[trigger.trigger_key] || '📨'}</span>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{trigger.trigger_label}</h3>
            <code className="text-[10px] text-slate-400 font-mono">{trigger.trigger_key}</code>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsActive(a => !a)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              isActive
                ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {isActive ? <><Zap className="w-3 h-3"/>Active</> : <><XCircle className="w-3 h-3"/>Inactive</>}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Template selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Linked Template
          </label>
          <div className="relative">
            <select
              value={selectedTemplateId}
              onChange={e => handleTemplateChange(e.target.value)}
              className="w-full appearance-none bg-slate-50 border border-slate-200 text-gray-800 text-sm rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            >
              <option value="">— Select a Meta template —</option>
              {allTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {!selectedTemplateId && (
            <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> No template linked — messages will not be sent for this trigger.
            </p>
          )}
        </div>

        {/* Variable Mapping */}
        {selectedTemplate && positions.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Variable Mapping
            </label>
            <div className="space-y-2">
              {positions.map(pos => {
                const mapping = varMap.find(v => v.position === pos)
                return (
                  <div key={pos} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                    <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg min-w-[36px] text-center">
                      {`{{${pos}}}`}
                    </span>
                    <span className="text-gray-400 text-sm">→</span>
                    <div className="relative flex-1">
                      <select
                        value={mapping?.field || ''}
                        onChange={e => handleFieldChange(pos, e.target.value)}
                        className="w-full appearance-none bg-white border border-slate-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-teal-400"
                      >
                        <option value="">— choose field —</option>
                        {trigger.available_fields.map(f => (
                          <option key={f.field} value={f.field}>{f.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                    {mapping?.field && (
                      <span className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded font-mono">
                        {trigger.available_fields.find(f => f.field === mapping.field)?.example || ''}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Available fields info */}
        {trigger.available_fields.length > 0 && (
          <div>
            <button
              onClick={() => setShowPreview(p => !p)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPreview ? 'Hide' : 'Show'} Message Preview
            </button>

            {showPreview && preview && (
              <div className="mt-2 bg-[#f0fdf4] border border-teal-100 rounded-xl p-4">
                <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Live Preview (example values)
                </p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {preview}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Available fields reference */}
        <details className="group">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 font-medium list-none flex items-center gap-1">
            <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            Available fields for this trigger
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {trigger.available_fields.map(f => (
              <span key={f.field} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono">
                {f.field}
              </span>
            ))}
          </div>
        </details>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        {/* Save */}
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !isChanged}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              saved
                ? 'bg-teal-500 text-white'
                : isChanged
                ? 'bg-slate-900 text-white hover:bg-slate-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {saved ? (
              <><CheckCircle className="w-4 h-4" /> Saved!</>
            ) : saving ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TemplateManagerClient({ initialData }: { initialData: PageData }) {
  const [data, setData] = useState<PageData>(initialData)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const reload = useCallback(async () => {
    try {
      const fresh = await getTemplateTriggers()
      if (fresh?.triggers) setData(fresh)
    } catch (_) {}
  }, [])

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await syncMetaTemplates()
      setSyncMsg(`✅ Synced ${res?.synced ?? 0} templates from Meta`)
      await reload()
    } catch (e: any) {
      setSyncMsg(`❌ Sync failed: ${e?.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Webhook className="w-8 h-8 text-indigo-600" />
            Template Manager
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm max-w-xl">
            Link Meta-approved WhatsApp templates to system events and configure how variables are populated automatically.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync from Meta
        </button>
      </div>

      {syncMsg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl font-medium ${syncMsg.startsWith('✅') ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'}`}>
          {syncMsg}
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 text-sm text-indigo-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
        <div>
          <strong>How it works:</strong> Each trigger maps to a Meta-approved template. You choose which system data field fills each <code className="bg-indigo-100 px-1 rounded text-xs">{'{{N}}'}</code> variable. Changes take effect immediately — no code changes or deployment needed.
        </div>
      </div>

      {/* Trigger Cards */}
      {data.triggers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No triggers found. Check your database setup.
        </div>
      ) : (
        <div className="grid gap-6">
          {data.triggers.map(trigger => (
            <TriggerCard
              key={trigger.trigger_key}
              trigger={trigger}
              allTemplates={data.all_templates}
              onSaved={reload}
            />
          ))}
        </div>
      )}
    </div>
  )
}
