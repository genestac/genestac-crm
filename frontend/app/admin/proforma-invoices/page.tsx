'use client'

import { useState, useEffect } from 'react'
import { getAdminProformaInvoices, deleteAdminProformaInvoice } from './actions'
import { Button } from '@/components/ui/button'
import { Eye, FileText, Trash2, Loader2, Download } from 'lucide-react'
import Link from 'next/link'

export default function AdminProformaInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await getAdminProformaInvoices()
      setInvoices(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice? This cannot be undone.')) return
    
    setDeletingId(id)
    try {
      await deleteAdminProformaInvoice(id)
      await loadData()
    } catch (err: any) {
      alert('Failed to delete: ' + err.message)
    } finally {
      setDeletingId(null)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Proforma Invoices</h1>
        <p className="text-gray-500 mt-1">Manage and view all proforma invoices across the entire system.</p>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">Invoice #</th>
                <th className="px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="px-4 py-3 font-medium text-gray-600">Created By</th>
                <th className="px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">Loading invoices...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">No invoices found.</td></tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900 font-medium">{inv.users?.name || 'Customer'}</div>
                    <div className="text-xs text-gray-500">{inv.users?.email || inv.users?.phone || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{inv.staffs?.name || 'Unknown'}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {formatCurrency(inv.total_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      inv.status === 'PAID' ? 'bg-green-100 text-green-700' : 
                      inv.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {inv.status || 'DRAFT'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/proforma-invoice/${inv.id}`} target="_blank">
                        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title="View Web Invoice">
                          <Eye className="w-4 h-4 text-brand-teal" />
                        </Button>
                      </Link>
                      
                      <Link href={`/api/sales/invoices/${inv.id}/pdf`} target="_blank">
                        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" title="Download PDF">
                          <Download className="w-4 h-4 text-blue-600" />
                        </Button>
                      </Link>

                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-2 text-red-500 hover:text-red-700 hover:bg-red-50" 
                        onClick={() => handleDelete(inv.id)}
                        disabled={deletingId === inv.id}
                        title="Delete Invoice"
                      >
                        {deletingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
