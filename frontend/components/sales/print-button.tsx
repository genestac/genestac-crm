'use client'

import { Printer, Loader2 } from 'lucide-react'
import { useState } from 'react'

export function PrintButton({ invoiceId, invoiceNumber }: { invoiceId?: string, invoiceNumber?: string }) {
  const [isLoading, setIsLoading] = useState(false)

  const handlePrint = async () => {
    if (!invoiceId) {
      window.print()
      return
    }
    
    try {
      setIsLoading(true)
      const res = await fetch(`/api/sales/invoices/${invoiceId}/pdf`)
      if (!res.ok) throw new Error("Failed to generate PDF")
      
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `PI_${invoiceNumber || 'Invoice'}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("PDF generation failed:", error)
      alert("Failed to generate PDF. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button 
      onClick={handlePrint}
      disabled={isLoading}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
      {isLoading ? 'Generating PDF...' : 'Download PDF'}
    </button>
  )
}
