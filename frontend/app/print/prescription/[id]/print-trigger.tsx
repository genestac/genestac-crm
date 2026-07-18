'use client'

import { useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'

interface RxData {
  id: string
  created_at: string
  general_instructions?: string
  patients?: { id?: string; name?: string; phone?: string; email?: string }
  doctors?: { id?: string; full_name?: string; phone?: string }
  prescription_items?: Array<{
    id?: string
    inventory?: { name?: string; sku?: string }
    dosage?: string
    frequency?: string
    duration_days?: number
    total_quantity_prescribed?: number
    time?: string
    before_lunch?: boolean
    after_lunch?: boolean
  }>
}

export default function PrintTrigger({ rx }: { rx: RxData }) {
  const [downloading, setDownloading] = useState(false)

  const downloadPDF = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/doctor/prescriptions/${rx.id}/pdf`)
      if (!res.ok) throw new Error('Failed to generate PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const patName = (rx.patients?.name || 'Patient').replace(/\s+/g, '_')
      a.download = `Prescription_${patName}_${rx.id.substring(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const rxDate = new Date(rx.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const rxIdShort = rx.id.substring(0, 8).toUpperCase()

  return (
    <>
      {/* Floating action bar */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden">
        <button
          onClick={downloadPDF}
          disabled={downloading}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white px-4 py-2 rounded-xl font-semibold shadow-lg transition-all"
        >
          {downloading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            : <><Download className="w-4 h-4" /> Download PDF</>
          }
        </button>
        <button
          onClick={() => window.close()}
          className="p-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl shadow transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </>
  )
}
