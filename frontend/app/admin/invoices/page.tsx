'use client'

import { useState, useEffect } from 'react'
import { getAdminInvoices, deleteAdminInvoice } from './actions'
import { CreateInvoiceModal } from './CreateInvoiceModal'
import { Button } from '@/components/ui/button'
import {
  Eye, FileText, Trash2, Loader2, Download, Plus,
  Receipt, Search, CreditCard, CheckCircle2, TrendingUp,
  IndianRupee,
} from 'lucide-react'
import Link from 'next/link'

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await getAdminInvoices()
      setInvoices(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await deleteAdminInvoice(id)
      await loadData()
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

  const filtered = invoices.filter(inv => {
    if (!searchQ) return true
    const q = searchQ.toLowerCase()
    return (
      (inv.invoice_number || '').toLowerCase().includes(q) ||
      (inv.users?.name || '').toLowerCase().includes(q) ||
      (inv.users?.phone || '').toLowerCase().includes(q) ||
      (inv.users?.email || '').toLowerCase().includes(q) ||
      (inv.razorpay_link_id || '').toLowerCase().includes(q)
    )
  })

  const totalRevenue = invoices.reduce((s, inv) => s + parseFloat(inv.total_amount || 0), 0)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRevenue = invoices
    .filter(inv => (inv.created_at || '').startsWith(todayStr))
    .reduce((s, inv) => s + parseFloat(inv.total_amount || 0), 0)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-violet-600" />
            Invoices
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Record paid invoices from external Razorpay payments. These reflect in dashboard revenue.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Invoices</p>
            <p className="text-xl font-bold text-gray-900">{invoices.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <IndianRupee className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Revenue</p>
            <p className="text-xl font-bold text-gray-900">{fmt(totalRevenue)}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Today's Revenue</p>
            <p className="text-xl font-bold text-gray-900">{fmt(todayRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 max-w-md focus-within:ring-2 focus-within:ring-violet-400 transition-all">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          className="flex-1 text-sm outline-none placeholder:text-slate-400"
          placeholder="Search by name, invoice #, payment ID..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Invoice #</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Created By</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Razorpay Ref</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />Loading invoices...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-14 text-gray-400">
                    <Receipt className="w-10 h-10 mx-auto mb-3 opacity-25" />
                    <p className="text-sm font-medium text-gray-500">
                      {invoices.length === 0 ? 'No invoices yet.' : 'No invoices match your search.'}
                    </p>
                    {invoices.length === 0 && (
                      <p className="text-xs mt-1">
                        Click <strong>Create Invoice</strong> to record an external Razorpay payment.
                      </p>
                    )}
                  </td>
                </tr>
              ) : filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-900 text-xs">
                    {inv.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(inv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900 font-medium text-sm">{inv.users?.name || 'Customer'}</div>
                    <div className="text-xs text-gray-500">{inv.users?.phone || inv.users?.email || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 text-sm">{inv.staffs?.name || 'Admin'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {inv.razorpay_link_id ? (
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-mono text-gray-600 truncate max-w-[120px]" title={inv.razorpay_link_id}>
                          {inv.razorpay_link_id}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {fmt(parseFloat(inv.total_amount))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      inv.status === 'PAID'
                        ? 'bg-green-100 text-green-700'
                        : inv.status === 'SENT'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {inv.status === 'PAID' && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {inv.status || 'PENDING'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* View */}
                      <Link href={`/proforma-invoice/${inv.id}`} target="_blank">
                        <Button variant="ghost" size="sm" className="h-8 px-2" title="View Invoice">
                          <Eye className="w-4 h-4 text-violet-600" />
                        </Button>
                      </Link>

                      {/* PDF */}
                      <Link href={`/api/sales/invoices/${inv.id}/pdf`} target="_blank">
                        <Button variant="ghost" size="sm" className="h-8 px-2" title="Download PDF">
                          <Download className="w-4 h-4 text-blue-600" />
                        </Button>
                      </Link>

                      {/* Delete */}
                      <Button
                        variant="ghost" size="sm"
                        className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(inv.id)}
                        disabled={deletingId === inv.id}
                        title="Delete Invoice"
                      >
                        {deletingId === inv.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={loadData}
        />
      )}
    </div>
  )
}
