'use client'

import { useState, useEffect, useRef } from 'react'
import {
  searchCustomersForInvoice,
  searchItemsForInvoice,
  createInvoice,
  getCustomerAddresses,
  type Customer,
  type CatalogItem,
  type CustomerAddress,
  type CreateInvoicePayload,
} from './actions'
import {
  X, Search, User, Package, Trash2, Loader2,
  CheckCircle, Tag, AlertCircle, FileText,
  Copy, ExternalLink, CreditCard, Receipt, Info, IndianRupee,
  MapPin, Truck, Building,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem extends CatalogItem {
  quantity: number
}

interface InvoiceResult {
  invoice_id: string
  invoice_number: string
  total_amount: number
  base_price: number
  discount_amount: number
  invoice_url: string
  items: any[]
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

function lineTotal(item: LineItem): number {
  return Math.round(item.mrp * item.quantity * 100) / 100
}

// ─── Customer Search ──────────────────────────────────────────────────────────

function CustomerSearch({ onSelect }: { onSelect: (c: Customer) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dq = useDebounce(q, 350)

  useEffect(() => {
    if (dq.length < 1) { setResults([]); return }
    setLoading(true)
    searchCustomersForInvoice(dq)
      .then(setResults).catch(() => setResults([])).finally(() => setLoading(false))
  }, [dq])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-violet-400 bg-white transition-all">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
          placeholder="Search by name, phone, or email..."
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => q.length > 0 && setOpen(true)}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {results.map(customer => (
            <button
              key={customer.id}
              type="button"
              onClick={() => { onSelect(customer); setQ(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 text-left transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-violet-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{customer.name}</p>
                <p className="text-xs text-gray-500 truncate">{customer.phone || customer.email || '—'}</p>
              </div>
              <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                customer.type === 'user' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {customer.type}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && q && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm text-gray-500">
          No customers found for "{q}"
        </div>
      )}
    </div>
  )
}

// ─── Item Search ──────────────────────────────────────────────────────────────

function ItemSearch({ onAdd }: { onAdd: (item: CatalogItem) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dq = useDebounce(q, 350)

  useEffect(() => {
    setLoading(true)
    searchItemsForInvoice(dq).then(setResults).catch(() => setResults([])).finally(() => setLoading(false))
  }, [dq])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isInventory = (type: string) => type === 'inventory' || type === 'inventory_variant'

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-violet-400 bg-white transition-all">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
          placeholder="Search products (with variants), plans..."
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-auto max-h-64">
          {results.map(item => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => { onAdd(item); setQ(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isInventory(item.type) ? 'bg-orange-100' : 'bg-purple-100'
              }`}>
                {isInventory(item.type)
                  ? <Package className="w-4 h-4 text-orange-600" />
                  : <Tag className="w-4 h-4 text-purple-600" />
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {fmtINR(item.mrp)} · {item.unit}
                  {item.gst_pct && item.gst_pct > 0 ? ` · GST ${item.gst_pct}% (incl.)` : ' · GST Incl.'}
                </p>
              </div>
              <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                isInventory(item.type) ? 'bg-orange-50 text-orange-700' : 'bg-purple-50 text-purple-700'
              }`}>
                {item.type === 'inventory_variant' ? 'Variant' : item.type === 'inventory' ? 'Product' : 'Plan'}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && q && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm text-gray-500">
          No items found for "{q}"
        </div>
      )}
    </div>
  )
}

// ─── Steps indicator ──────────────────────────────────────────────────────────

type StepNum = 1 | 2 | 3 | 4 | 5

const STEPS = ['Customer', 'Addresses', 'Payment', 'Items', 'Done']

function StepBar({ current }: { current: StepNum }) {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-2 border-b bg-slate-50 flex-shrink-0 overflow-x-auto">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
            current === i + 1 ? 'bg-violet-700 text-white' :
            current > i + 1 ? 'bg-violet-100 text-violet-700' :
            'text-slate-400'
          }`}>
            {current > i + 1 ? <CheckCircle className="w-3 h-3" /> : <span>{i + 1}</span>}
            {label}
          </div>
          {i < STEPS.length - 1 && <div className="w-4 h-px bg-slate-200 mx-1" />}
        </div>
      ))}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function CreateInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<StepNum>(1)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<InvoiceResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(false)

  // Billing address state
  const [billingAddressId, setBillingAddressId] = useState<string>('new')
  const [billingContactName, setBillingContactName] = useState('')
  const [billingContactPhone, setBillingContactPhone] = useState('')
  const [billingHouseNo, setBillingHouseNo] = useState('')
  const [billingAddressLine1, setBillingAddressLine1] = useState('')
  const [billingAddressLine2, setBillingAddressLine2] = useState('')
  const [billingLandmark, setBillingLandmark] = useState('')
  const [billingCity, setBillingCity] = useState('')
  const [billingState, setBillingState] = useState('')
  const [billingPostalCode, setBillingPostalCode] = useState('')
  const [billingSaveToUser, setBillingSaveToUser] = useState(true)

  // Shipping address state
  const [sameAsBilling, setSameAsBilling] = useState(true)
  const [shippingAddressId, setShippingAddressId] = useState<string>('new')
  const [shippingContactName, setShippingContactName] = useState('')
  const [shippingContactPhone, setShippingContactPhone] = useState('')
  const [shippingHouseNo, setShippingHouseNo] = useState('')
  const [shippingAddressLine1, setShippingAddressLine1] = useState('')
  const [shippingAddressLine2, setShippingAddressLine2] = useState('')
  const [shippingLandmark, setShippingLandmark] = useState('')
  const [shippingCity, setShippingCity] = useState('')
  const [shippingState, setShippingState] = useState('')
  const [shippingPostalCode, setShippingPostalCode] = useState('')
  const [shippingSaveToUser, setShippingSaveToUser] = useState(true)

  // Supply & Delivery
  const [placeOfSupply, setPlaceOfSupply] = useState('Haryana')
  const [placeOfDelivery, setPlaceOfDelivery] = useState('Haryana')

  // Payment details
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('')
  const [razorpayOrderId, setRazorpayOrderId] = useState('')
  const [razorpayLinkId, setRazorpayLinkId] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [piId, setPiId] = useState('')
  const [paidAmount, setPaidAmount] = useState('')

  const itemsSubtotal = lineItems.reduce((s, i) => s + lineTotal(i), 0)

  const addItem = (item: CatalogItem) => {
    setLineItems(prev => {
      const exists = prev.find(l => l.id === item.id && l.type === item.type)
      if (exists) return prev.map(l => l.id === item.id && l.type === item.type ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, { ...item, quantity: 1 }]
    })
  }

  const removeItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx))

  const updateQty = (idx: number, val: number) => {
    setLineItems(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, val) } : l))
  }

  // Auto-fill paid amount when items change
  useEffect(() => {
    if (!paidAmount && itemsSubtotal > 0) {
      setPaidAmount(String(itemsSubtotal))
    }
  }, [itemsSubtotal]) // eslint-disable-line

  const applyBillingAddress = (addr: CustomerAddress) => {
    setBillingAddressId(addr.id)
    setBillingHouseNo(addr.house_no || '')
    setBillingAddressLine1(addr.address_line_1 || '')
    setBillingAddressLine2(addr.address_line_2 || '')
    setBillingLandmark(addr.landmark || '')
    setBillingCity(addr.city || '')
    setBillingState(addr.state || '')
    setBillingPostalCode(addr.postal_code || '')
    if (addr.state) {
      setPlaceOfSupply(addr.state)
      if (sameAsBilling) setPlaceOfDelivery(addr.state)
    }
  }

  const applyShippingAddress = (addr: CustomerAddress) => {
    setShippingAddressId(addr.id)
    setShippingHouseNo(addr.house_no || '')
    setShippingAddressLine1(addr.address_line_1 || '')
    setShippingAddressLine2(addr.address_line_2 || '')
    setShippingLandmark(addr.landmark || '')
    setShippingCity(addr.city || '')
    setShippingState(addr.state || '')
    setShippingPostalCode(addr.postal_code || '')
    if (addr.state) {
      setPlaceOfDelivery(addr.state)
    }
  }

  const handleSelectCustomer = async (c: Customer) => {
    setCustomer(c)
    setBillingContactName(c.name || '')
    setBillingContactPhone(c.phone || '')
    setShippingContactName(c.name || '')
    setShippingContactPhone(c.phone || '')

    setLoadingAddresses(true)
    try {
      const addrs = await getCustomerAddresses(c.id)
      setSavedAddresses(addrs)
      if (addrs.length > 0) {
        const def = addrs.find(a => a.is_default) || addrs[0]
        applyBillingAddress(def)
      } else {
        setBillingAddressId('new')
      }
    } catch (e) {
      console.error('Error fetching addresses:', e)
    } finally {
      setLoadingAddresses(false)
    }

    setStep(2)
  }

  const handleCreate = async () => {
    if (!customer || lineItems.length === 0) return
    const amt = parseFloat(paidAmount)
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid paid amount')
      return
    }

    setCreating(true)
    setError('')
    try {
      const effectiveShipping = sameAsBilling ? {
        contact_name: billingContactName,
        contact_phone: billingContactPhone,
        house_no: billingHouseNo,
        address_line_1: billingAddressLine1,
        address_line_2: billingAddressLine2,
        landmark: billingLandmark,
        city: billingCity,
        state: billingState,
        postal_code: billingPostalCode,
        address_id: billingAddressId !== 'new' ? billingAddressId : undefined,
        save_to_user: billingSaveToUser,
      } : {
        contact_name: shippingContactName,
        contact_phone: shippingContactPhone,
        house_no: shippingHouseNo,
        address_line_1: shippingAddressLine1,
        address_line_2: shippingAddressLine2,
        landmark: shippingLandmark,
        city: shippingCity,
        state: shippingState,
        postal_code: shippingPostalCode,
        address_id: shippingAddressId !== 'new' ? shippingAddressId : undefined,
        save_to_user: shippingSaveToUser,
      }

      const payload: CreateInvoicePayload = {
        customer_id: customer.id,
        customer_type: customer.type,
        razorpay_payment_id: razorpayPaymentId || undefined,
        razorpay_order_id: razorpayOrderId || undefined,
        razorpay_payment_link_id: razorpayLinkId || undefined,
        payment_note: paymentNote || undefined,
        pi_id: piId || undefined,
        total_amount: amt,
        items: lineItems.map(l => ({
          item_type: l.type,
          item_id: l.id,
          inventory_id: l.inventory_id,
          plan_id: l.plan_id,
          name: l.name,
          mrp: l.mrp,
          quantity: l.quantity,
          unit: l.unit,
        })),
        billing_address: {
          contact_name: billingContactName,
          contact_phone: billingContactPhone,
          house_no: billingHouseNo,
          address_line_1: billingAddressLine1,
          address_line_2: billingAddressLine2,
          landmark: billingLandmark,
          city: billingCity,
          state: billingState,
          postal_code: billingPostalCode,
          address_id: billingAddressId !== 'new' ? billingAddressId : undefined,
          save_to_user: billingSaveToUser,
        },
        shipping_address: effectiveShipping,
        place_of_supply: placeOfSupply || billingState || 'Haryana',
        place_of_delivery: placeOfDelivery || (sameAsBilling ? (billingState || 'Haryana') : (shippingState || 'Haryana')),
      }

      const inv = await createInvoice(payload)
      setResult(inv)
      setStep(5)
      onCreated()
    } catch (e: any) {
      setError(e.message || 'Failed to create invoice')
    } finally {
      setCreating(false)
    }
  }

  const copyLink = () => {
    if (!result?.invoice_url) return
    navigator.clipboard.writeText(result.invoice_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const goBack = () => setStep(s => Math.max(1, s - 1) as StepNum)
  const goNext = () => setStep(s => Math.min(5, s + 1) as StepNum)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-violet-900 to-violet-700">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-violet-200" />
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Create Invoice</h2>
              <p className="text-violet-200 text-xs">External Razorpay Payment • Record Paid Revenue</p>
            </div>
          </div>
          <button onClick={onClose} className="text-violet-300 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <StepBar current={step} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Step 1: Customer ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Select Customer</label>
                <p className="text-xs text-gray-500 mb-2">Search by name, phone number, or email</p>
                <CustomerSearch onSelect={handleSelectCustomer} />
              </div>
              {customer && (
                <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-violet-200 flex items-center justify-center">
                    <User className="w-4 h-4 text-violet-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{customer.name}</p>
                    <p className="text-xs text-gray-500">{customer.phone || customer.email || customer.type}</p>
                  </div>
                  <button onClick={goNext} className="text-xs font-semibold text-violet-700 bg-violet-100 px-3 py-1 rounded-full hover:bg-violet-200 transition-colors">
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Addresses & Place of Supply ── */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Customer chip */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-sm font-medium text-gray-800">{customer?.name}</span>
                <span className="text-xs text-gray-400">{customer?.phone}</span>
                <button onClick={() => setStep(1)} className="ml-auto text-xs text-slate-500 hover:text-slate-700 underline">Change</button>
              </div>

              {/* Billing Address */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-gray-900">Billing Address</h3>
                  </div>
                  {savedAddresses.length > 0 && (
                    <span className="text-xs text-emerald-600 font-medium">
                      {savedAddresses.length} saved address{savedAddresses.length > 1 ? 'es' : ''} available
                    </span>
                  )}
                </div>

                {/* Dropdown of saved addresses */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Select from Customer Profile</label>
                  <select
                    value={billingAddressId}
                    onChange={e => {
                      const val = e.target.value
                      setBillingAddressId(val)
                      if (val === 'new') {
                        setBillingHouseNo('')
                        setBillingAddressLine1('')
                        setBillingAddressLine2('')
                        setBillingLandmark('')
                        setBillingCity('')
                        setBillingState('')
                        setBillingPostalCode('')
                      } else {
                        const found = savedAddresses.find(a => a.id === val)
                        if (found) applyBillingAddress(found)
                      }
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                  >
                    {savedAddresses.map((addr, i) => (
                      <option key={addr.id} value={addr.id}>
                        {addr.house_no ? `${addr.house_no}, ` : ''}{addr.address_line_1}, {addr.city}, {addr.state} ({addr.postal_code}) {addr.is_default ? '★ Default' : ''}
                      </option>
                    ))}
                    <option value="new">+ Enter New Address</option>
                  </select>
                </div>

                {/* Billing contact details */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person Name</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="Full Name"
                      value={billingContactName}
                      onChange={e => setBillingContactName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="Phone Number"
                      value={billingContactPhone}
                      onChange={e => setBillingContactPhone(e.target.value)}
                    />
                  </div>
                </div>

                {/* Billing address fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">House / Flat / Building No.</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="e.g. Flat 402, Block B"
                      value={billingHouseNo}
                      onChange={e => setBillingHouseNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1 <span className="text-red-500">*</span></label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="Street / Locality"
                      value={billingAddressLine1}
                      onChange={e => setBillingAddressLine1(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2 (Optional)</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="Area / Sector"
                      value={billingAddressLine2}
                      onChange={e => setBillingAddressLine2(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Landmark (Optional)</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="Near City Park"
                      value={billingLandmark}
                      onChange={e => setBillingLandmark(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="e.g. Gurugram"
                      value={billingCity}
                      onChange={e => setBillingCity(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="e.g. Haryana"
                      value={billingState}
                      onChange={e => {
                        setBillingState(e.target.value)
                        if (!placeOfSupply || placeOfSupply === 'Haryana') setPlaceOfSupply(e.target.value)
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">PIN / Postal Code</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="e.g. 122018"
                      value={billingPostalCode}
                      onChange={e => setBillingPostalCode(e.target.value)}
                    />
                  </div>
                </div>

                {billingAddressId === 'new' && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 pt-1">
                    <input
                      type="checkbox"
                      checked={billingSaveToUser}
                      onChange={e => setBillingSaveToUser(e.target.checked)}
                      className="rounded text-violet-600 focus:ring-violet-400"
                    />
                    Save this address to customer profile in database
                  </label>
                )}
              </div>

              {/* Shipping Address */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-gray-900">Shipping Address</h3>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-violet-700 bg-violet-50 px-3 py-1 rounded-full border border-violet-200">
                    <input
                      type="checkbox"
                      checked={sameAsBilling}
                      onChange={e => setSameAsBilling(e.target.checked)}
                      className="rounded text-violet-600 focus:ring-violet-400"
                    />
                    Same as billing address
                  </label>
                </div>

                {!sameAsBilling && (
                  <div className="space-y-4 pt-1">
                    {/* Shipping dropdown */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Select from Customer Profile</label>
                      <select
                        value={shippingAddressId}
                        onChange={e => {
                          const val = e.target.value
                          setShippingAddressId(val)
                          if (val === 'new') {
                            setShippingHouseNo('')
                            setShippingAddressLine1('')
                            setShippingAddressLine2('')
                            setShippingLandmark('')
                            setShippingCity('')
                            setShippingState('')
                            setShippingPostalCode('')
                          } else {
                            const found = savedAddresses.find(a => a.id === val)
                            if (found) applyShippingAddress(found)
                          }
                        }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      >
                        {savedAddresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.house_no ? `${addr.house_no}, ` : ''}{addr.address_line_1}, {addr.city}, {addr.state} ({addr.postal_code})
                          </option>
                        ))}
                        <option value="new">+ Enter New Address</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person Name</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="Full Name"
                          value={shippingContactName}
                          onChange={e => setShippingContactName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="Phone Number"
                          value={shippingContactPhone}
                          onChange={e => setShippingContactPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">House / Flat / Building No.</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="e.g. Flat 101"
                          value={shippingHouseNo}
                          onChange={e => setShippingHouseNo(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="Street / Locality"
                          value={shippingAddressLine1}
                          onChange={e => setShippingAddressLine1(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2 (Optional)</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="Area / Sector"
                          value={shippingAddressLine2}
                          onChange={e => setShippingAddressLine2(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Landmark (Optional)</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="Near Landmark"
                          value={shippingLandmark}
                          onChange={e => setShippingLandmark(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="City"
                          value={shippingCity}
                          onChange={e => setShippingCity(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="State"
                          value={shippingState}
                          onChange={e => {
                            setShippingState(e.target.value)
                            if (!placeOfDelivery || placeOfDelivery === 'Haryana') setPlaceOfDelivery(e.target.value)
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">PIN / Postal Code</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400"
                          placeholder="Postal Code"
                          value={shippingPostalCode}
                          onChange={e => setShippingPostalCode(e.target.value)}
                        />
                      </div>
                    </div>

                    {shippingAddressId === 'new' && (
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600 pt-1">
                        <input
                          type="checkbox"
                          checked={shippingSaveToUser}
                          onChange={e => setShippingSaveToUser(e.target.checked)}
                          className="rounded text-violet-600 focus:ring-violet-400"
                        />
                        Save shipping address to customer profile
                      </label>
                    )}
                  </div>
                )}
              </div>

              {/* Place of Supply & Delivery */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-violet-600" />
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">GST Place of Supply & Delivery</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Place of Supply (State)</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      placeholder="e.g. Haryana"
                      value={placeOfSupply}
                      onChange={e => setPlaceOfSupply(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Place of Delivery (State)</label>
                    <input
                      className="w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                      placeholder="e.g. Haryana"
                      value={placeOfDelivery}
                      onChange={e => setPlaceOfDelivery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Payment Details ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Customer chip */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-sm font-medium text-gray-800">{customer?.name}</span>
                <span className="text-xs text-gray-400">{customer?.phone}</span>
                <button onClick={() => setStep(1)} className="ml-auto text-xs text-slate-500 hover:text-slate-700 underline">Change</button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Enter the Razorpay payment details from the external payment. This invoice will be marked as <strong>PAID</strong>, so <strong>no payment link</strong> will be presented to the customer.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Razorpay Payment ID <span className="text-gray-400 font-normal">(e.g. pay_Abc123)</span></label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300 font-mono"
                    placeholder="pay_..."
                    value={razorpayPaymentId}
                    onChange={e => setRazorpayPaymentId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Razorpay Order ID <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300 font-mono"
                    placeholder="order_..."
                    value={razorpayOrderId}
                    onChange={e => setRazorpayOrderId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payment Link ID <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300 font-mono"
                    placeholder="plink_..."
                    value={razorpayLinkId}
                    onChange={e => setRazorpayLinkId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Link to Existing PI <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300 font-mono"
                    placeholder="PI UUID..."
                    value={piId}
                    onChange={e => setPiId(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Internal Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-300 resize-none"
                  rows={2}
                  placeholder="e.g. Customer paid via external WhatsApp payment link on 31 Oct..."
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── Step 4: Items & Amount ── */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Customer + payment chip */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-800">{customer?.name}</span>
                </div>
                {razorpayPaymentId && (
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="text-xs font-mono text-gray-600 truncate max-w-[120px]">{razorpayPaymentId}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-xs text-gray-600">{placeOfSupply}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Add Products / Plans</label>
                <p className="text-xs text-gray-500 mb-2">
                  Select the specific variant of a product or plan.
                  <span className="ml-1 text-violet-600 font-medium">GST is already included in catalog prices.</span>
                </p>
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
                        <th className="px-3 py-2 text-right font-semibold text-gray-600 text-xs w-28">Total</th>
                        <th className="px-2 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-xs leading-tight">{item.name}</p>
                            <p className="text-[10px] text-gray-400">MRP {fmtINR(item.mrp)} · {item.unit}</p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number" min={1}
                              value={item.quantity}
                              onChange={e => updateQty(idx, Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 text-center border border-slate-200 rounded-lg text-xs py-1 outline-none focus:ring-2 focus:ring-violet-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900 text-xs">
                            {fmtINR(lineTotal(item))}
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
                        <td colSpan={2} className="px-4 py-2.5 text-xs text-gray-500">Catalogue Total</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-700">{fmtINR(itemsSubtotal)}</td>
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

              {/* Actual paid amount */}
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <IndianRupee className="w-4 h-4 text-violet-600" />
                      Actual Amount Paid (from Razorpay)
                      <span className="text-red-500">*</span>
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">Enter the exact amount the customer paid. This is what reflects in revenue.</p>
                  <div className="flex items-center gap-2 bg-white border border-violet-300 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-violet-400">
                    <span className="text-sm font-semibold text-gray-500">₹</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="flex-1 text-sm font-semibold outline-none text-gray-900"
                      placeholder="0.00"
                      value={paidAmount}
                      onChange={e => setPaidAmount(e.target.value)}
                    />
                  </div>
                </div>
                {paidAmount && parseFloat(paidAmount) > 0 && itemsSubtotal > parseFloat(paidAmount) && (
                  <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    Discount applied: {fmtINR(itemsSubtotal - parseFloat(paidAmount))} ({((itemsSubtotal - parseFloat(paidAmount)) / itemsSubtotal * 100).toFixed(1)}% off)
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === 5 && result && (
            <div className="space-y-5">
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-violet-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Invoice Created!</h3>
                <p className="text-gray-500 text-sm mt-1">#{result.invoice_number} · Status: <span className="text-green-600 font-semibold">PAID</span></p>
              </div>

              {/* Totals card */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                <div className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-600">Catalogue Value</span>
                  <span className="font-medium">{fmtINR(result.base_price)}</span>
                </div>
                {result.discount_amount > 0 && (
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-green-700">−{fmtINR(result.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-3 font-bold text-gray-900">
                  <span>Amount Paid</span>
                  <span className="text-violet-700">{fmtINR(result.total_amount)}</span>
                </div>
              </div>

              {/* Invoice link */}
              <div className="border border-violet-200 bg-violet-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-violet-700 mb-2">Invoice Link (Proforma / Tax Invoice)</p>
                <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-lg px-3 py-2">
                  <p className="flex-1 text-xs text-gray-700 font-mono truncate">{result.invoice_url}</p>
                  <button
                    onClick={copyLink}
                    className="text-violet-600 hover:text-violet-800 transition-colors shrink-0"
                    title="Copy link"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a href={result.invoice_url} target="_blank" rel="noreferrer" className="text-violet-600 hover:text-violet-800 transition-colors shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Payment link is omitted from this invoice since it is already marked PAID. Share this link for customer viewing or download PDF.
                </p>
              </div>

              {/* Download PDF */}
              <a
                href={`/api/sales/invoices/${result.invoice_id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Download PDF Invoice
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 5 && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50 flex-shrink-0">
            <button
              onClick={step === 1 ? onClose : goBack}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              {step === 1 ? 'Cancel' : '← Back'}
            </button>

            {step === 1 && (
              <button
                disabled={!customer}
                onClick={goNext}
                className="px-5 py-2 rounded-xl bg-violet-700 text-white text-sm font-semibold disabled:opacity-40 hover:bg-violet-800 transition-colors"
              >
                Next: Addresses →
              </button>
            )}

            {step === 2 && (
              <button
                onClick={goNext}
                className="px-5 py-2 rounded-xl bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 transition-colors"
              >
                Next: Payment Details →
              </button>
            )}

            {step === 3 && (
              <button
                onClick={goNext}
                className="px-5 py-2 rounded-xl bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 transition-colors"
              >
                Next: Add Items →
              </button>
            )}

            {step === 4 && (
              <button
                disabled={lineItems.length === 0 || creating || !paidAmount || parseFloat(paidAmount) <= 0}
                onClick={handleCreate}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-700 text-white text-sm font-semibold disabled:opacity-40 hover:bg-violet-800 transition-colors"
              >
                {creating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                  : <><Receipt className="w-4 h-4" /> Create Invoice</>}
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="px-6 py-4 border-t bg-slate-50 flex-shrink-0 flex justify-end">
            <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
