'use client'

import { useState, useEffect } from 'react'
import { getUnassignedLeads, getSalesReps, assignLead } from './actions'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

export default function LeadAssignmentPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [salesReps, setSalesReps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  
  const loadData = async () => {
    setLoading(true)
    try {
      const [leadsData, repsData] = await Promise.all([
        getUnassignedLeads(),
        getSalesReps()
      ])
      setLeads(leadsData)
      setSalesReps(repsData)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAssign = async (e: React.FormEvent<HTMLFormElement>, leadId: string) => {
    e.preventDefault()
    setAssigningId(leadId)
    const formData = new FormData(e.currentTarget)
    try {
      await assignLead(formData)
      await loadData() // Refresh list
    } catch (err: any) {
      alert(err.message)
    } finally {
      setAssigningId(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Lead Assignment</h1>
        <p className="text-gray-500 mt-1">Assign unassigned website leads and registered users to Sales Representatives.</p>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 font-medium text-gray-600">Contact</th>
              <th className="px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 font-medium text-gray-600">Created At</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right w-72">Assign To</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Loading unassigned leads...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">No unassigned leads found! 🎉</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{(lead.id || "").substring(0,8)}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{lead.name || '-'}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-900">{lead.phone || '-'}</div>
                  <div className="text-xs text-gray-500">{lead.email || ''}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${lead.record_type === 'USER' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {lead.record_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <form onSubmit={(e) => handleAssign(e, lead.id)} className="flex items-center gap-2 justify-end">
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="record_type" value={lead.record_type} />
                    
                    <Select name="sales_rep_id">
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Select Rep..." />
                      </SelectTrigger>
                      <SelectContent>
                        {salesReps.map(rep => (
                          <SelectItem key={rep.id} value={rep.id}>{rep.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Button type="submit" size="sm" className="h-8" disabled={assigningId === lead.id}>
                      {assigningId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Assign'}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
