'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  searchLeadsForPI,
  searchItemsForPI,
  createAdminPI,
  sendPIWhatsapp,
} from './actions'
import {
  X, Search, User, Package, Plus, Trash2, Loader2,
  CheckCircle, Send, ChevronDown, Tag, AlertCircle,
  FileText, Copy, ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string; name: string; phone?: string; email?: string; type: 'lead' | 'user'
}
interface CatalogItem {
  id: string; type: 'inventory' | 'plan_variant' | 'plan'
  plan_id?: string; name: string; mrp: number; unit: string
}
interface LineItem extends CatalogItem {
  quantity: number
  discount_pct: number
}
interface PIResult {
  invoice_id: string; invoice_number: string; total_amount: number
  base_price: number; discount_amount: number; gst_amount: number
  razorpay_url?: string; items: any[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function useDebounce<T>(value: T, delay = 350): T {
  const [d, setD] = useState(value)
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t) }, [value, delay])
  return d
}

function computeLineTotal(item: LineItem): number {
  const discounted = item.mrp * (1 - item.discount_pct / 100)
  return Math.round(discounted * item.quantity * 100) / 100
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CustomerSearch({ onSelect }: { onSelect: (l: Lead) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const dq = useDebounce(q, 350)

  useEffect(() => {
    if (dq.length < 1) { setResults([]); return }
    setLoading(true)
    searchLeadsForPI(dq)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [dq])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-teal-400 bg-white">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
          placeholder="Search by name or phone..."
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {results.map(lead => (
            <button
              key={lead.id}
              type="button"
              onClick={() => { onSelect(lead); setQ(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
            >
              <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-teal-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                <p className="text-xs text-gray-500">{lead.phone || lead.email || lead.type}</p>
              </div>
              <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${lead.type === 'user' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                {lead.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemSearch({ onAdd }: { onAdd: (item: CatalogItem) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const dq = useDebounce(q, 350)

  useEffect(() => {
    setLoading(true)
    searchItemsForPI(dq)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [dq])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-teal-400 bg-white">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
          placeholder="Search products, plans, variants..."
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-auto max-h-64">
          {results.map(item => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => { onAdd(item); setQ(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${item.type === 'inventory' ? 'bg-orange-100' : 'bg-purple-100'}`}>
                {item.type === 'inventory'
                  ? <Package className="w-4 h-4 text-orange-600" />
                  : <Tag className="w-4 h-4 text-purple-600" />
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-500">MRP {fmtINR(item.mrp)} · {item.unit}</p>
              </div>
              <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                item.type === 'inventory' ? 'bg-orange-50 text-orange-700' : 'bg-purple-50 text-purple-700'
              }`}>
                {item.type === 'inventory' ? 'Product' : 'Plan'}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && q && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-500">
          No items found for "{q}"
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function CreatePIModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [customer, setCustomer] = useState<Lead | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<PIResult | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const subtotal = lineItems.reduce((s, i) => s + computeLineTotal(i), 0)

  const addItem = (item: CatalogItem) => {
    setLineItems(prev => {
      const exists = prev.find(l => l.id === item.id && l.type === item.type)
      if (exists) return prev.map(l => l.id === item.id && l.type === item.type ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, { ...item, quantity: 1, discount_pct: 0 }]
    })
  }

  const removeItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx))

  const updateItem = (idx: number, field: 'quantity' | 'discount_pct', val: number) => {
    setLineItems(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }

  const handleCreate = async () => {
    if (!customer || lineItems.length === 0) return
    setCreating(true); setError('')
    try {
      const payload = {
        lead_id: customer.id,
        items: lineItems.map(l => ({
          item_type: l.type,
          item_id: l.id,
          plan_id: l.plan_id,
          quantity: l.quantity,
          discount_pct: l.discount_pct,
        })),
      }
      const pi = await createAdminPI(payload)
      setResult(pi)
      setStep(3)
      onCreated()
    } catch (e: any) {
      setError(e.message || 'Failed to create PI')
    } finally {
      setCreating(false)
    }
  }

  const handleSendWA = async () => {
    if (!result) return
    setSending(true)
    try {
      await sendPIWhatsapp(result.invoice_id)
      setSent(true)
    } catch (e: any) {
      alert('WhatsApp send failed: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-slate-900 to-slate-700">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-teal-400" />
            <h2 className="text-white font-bold text-lg">Create Proforma Invoice</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 pt-4 pb-2 border-b bg-slate-50 flex-shrink-0">
          {(['Customer', 'Items', 'Done'] as const).map((label, i) => (
            <div key={label} className="flex items-center">
              <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                step === i + 1 ? 'bg-slate-900 text-white' :
                step > i + 1 ? 'bg-teal-100 text-teal-700' :
                'text-slate-400'
              }`}>
                {step > i + 1 ? <CheckCircle className="w-3 h-3" /> : <span>{i + 1}</span>}
                {label}
              </div>
              {i < 2 && <div className="w-6 h-px bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Step 1: Customer ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Customer</label>
                <CustomerSearch onSelect={c => { setCustomer(c); setStep(2) }} />
              </div>
              {customer && (
                <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-teal-200 flex items-center justify-center">
                    <User className="w-4 h-4 text-teal-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                    <p className="text-xs text-gray-500">{customer.phone || customer.email}</p>
                  </div>
                  <button onClick={() => setStep(2)} className="ml-auto text-xs font-semibold text-teal-700 bg-teal-100 px-3 py-1 rounded-full hover:bg-teal-200">
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Items ── */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Selected customer banner */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                <User className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-gray-800">{customer?.name}</span>
                <span className="text-xs text-gray-400">{customer?.phone}</span>
                <button onClick={() => setStep(1)} className="ml-auto text-xs text-slate-500 hover:text-slate-700 underline">Change</button>
              </div>

              {/* Item search */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Add Products / Plans</label>
                <ItemSearch onAdd={addItem} />
              </div>

              {/* Line items table */}
              {lineItems.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-600 text-xs">Item</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 text-xs w-20">Qty</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 text-xs w-24">Disc %</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 text-xs w-28">Total</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-xs leading-tight">{item.name}</p>
                            <p className="text-[10px] text-gray-400">MRP {fmtINR(item.mrp)}</p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number" min={1}
                              value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 text-center border border-slate-200 rounded-lg text-xs py-1 outline-none focus:ring-2 focus:ring-teal-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <input
                                type="number" min={0} max={100} step={0.5}
                                value={item.discount_pct}
                                onChange={e => updateItem(idx, 'discount_pct', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                                className="w-14 text-center border border-slate-200 rounded-lg text-xs py-1 outline-none focus:ring-2 focus:ring-teal-400"
                              />
                              <span className="text-xs text-gray-400">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 text-xs">
                            {fmtINR(computeLineTotal(item))}
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t">
                      <tr>
                        <td colSpan={3} className="px-4 py-2.5 text-xs font-bold text-gray-700">Subtotal</td>
                        <td className="px-3 py-2.5 text-right text-sm font-bold text-gray-900">{fmtINR(subtotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {lineItems.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-slate-200 rounded-xl">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Search and add products or plans above</p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 3 && result && (
            <div className="space-y-5">
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-teal-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Invoice Created!</h3>
                <p className="text-gray-500 text-sm mt-1">#{result.invoice_number}</p>
              </div>

              {/* Totals card */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-600">Base Price</span>
                  <span className="font-medium">{fmtINR(result.base_price)}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-medium text-green-700">−{fmtINR(result.discount_amount)}</span>
                </div>
                {result.gst_amount > 0 && (
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-600">GST</span>
                    <span className="font-medium">{fmtINR(result.gst_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-3 font-bold text-gray-900">
                  <span>Total Payable</span>
                  <span className="text-teal-700">{fmtINR(result.total_amount)}</span>
                </div>
              </div>

              {/* Payment link */}
              {result.razorpay_url && (
                <div className="border border-teal-200 bg-teal-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-teal-700 mb-2">Payment Link</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-gray-700 font-mono truncate">{result.razorpay_url}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(result.razorpay_url!)}
                      className="text-teal-600 hover:text-teal-800"
                      title="Copy link"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <a href={result.razorpay_url} target="_blank" rel="noreferrer" className="text-teal-600 hover:text-teal-800">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              {/* WhatsApp send */}
              <button
                onClick={handleSendWA}
                disabled={sending || sent}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                  sent
                    ? 'bg-teal-500 text-white'
                    : 'bg-[#25d366] hover:bg-[#1ebe5c] text-white'
                }`}
              >
                {sent ? (
                  <><CheckCircle className="w-4 h-4" /> Sent on WhatsApp!</>
                ) : sending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="w-4 h-4" /> Send PI on WhatsApp</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step !== 3 && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50 flex-shrink-0">
            <button
              onClick={step === 1 ? onClose : () => setStep(s => (s - 1) as 1 | 2)}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              {step === 1 ? 'Cancel' : '← Back'}
            </button>

            {step === 1 && (
              <button
                disabled={!customer}
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-slate-700"
              >
                Next: Add Items →
              </button>
            )}

            {step === 2 && (
              <button
                disabled={lineItems.length === 0 || creating}
                onClick={handleCreate}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-teal-700"
              >
                {creating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                  : <><FileText className="w-4 h-4" /> Create PI</>}
              </button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="px-6 py-4 border-t bg-slate-50 flex-shrink-0 flex justify-end">
            <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
