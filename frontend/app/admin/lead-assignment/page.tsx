'use client'

import { useState, useEffect } from 'react'
import { getUnassignedLeads, getSalesReps, assignLead, assignLeadsBulk } from './actions'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, CheckSquare } from 'lucide-react'

export default function LeadAssignmentPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [salesReps, setSalesReps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  
  // Bulk selection state
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkSalesRep, setBulkSalesRep] = useState<string>('')
  
  const loadData = async () => {
    setLoading(true)
    try {
      const [leadsData, repsData] = await Promise.all([
        getUnassignedLeads(),
        getSalesReps()
      ])
      setLeads(leadsData)
      setSalesReps(repsData)
      setSelectedLeads(new Set()) // clear selection on reload
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

  const toggleLeadSelection = (leadId: string) => {
    const newSelection = new Set(selectedLeads)
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId)
    } else {
      newSelection.add(leadId)
    }
    setSelectedLeads(newSelection)
  }

  const toggleAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set())
    } else {
      setSelectedLeads(new Set(leads.map(l => l.id)))
    }
  }

  const handleBulkAssign = async () => {
    if (!bulkSalesRep) {
      alert("Please select a Sales Representative first.")
      return
    }
    
    setBulkAssigning(true)
    try {
      // Build the payload
      const leadsPayload = Array.from(selectedLeads).map(id => {
        const lead = leads.find(l => l.id === id)
        return { lead_id: id, record_type: lead.record_type }
      })
      
      await assignLeadsBulk(leadsPayload, bulkSalesRep)
      await loadData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkAssigning(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Lead Assignment</h1>
        <p className="text-gray-500 mt-1">Assign unassigned website leads and registered users to Sales Representatives.</p>
      </div>
      
      {/* Bulk Action Bar */}
      {selectedLeads.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center text-blue-800 font-medium">
            <CheckSquare className="w-5 h-5 mr-2" />
            {selectedLeads.size} leads selected
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-700">Assign to:</span>
            <Select value={bulkSalesRep} onValueChange={(val) => setBulkSalesRep(val || '')}>
              <SelectTrigger className="w-[200px] h-9 bg-white">
                <SelectValue placeholder="Select Rep..." />
              </SelectTrigger>
              <SelectContent>
                {salesReps.map(rep => (
                  <SelectItem key={rep.id} value={rep.id}>{rep.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleBulkAssign} disabled={bulkAssigning || !bulkSalesRep} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
              {bulkAssigning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Assign Selected
            </Button>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600 w-10">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={leads.length > 0 && selectedLeads.size === leads.length}
                  onChange={toggleAll}
                  disabled={leads.length === 0}
                />
              </th>
              <th className="px-4 py-3 font-medium text-gray-600">ID</th>
              <th className="px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 font-medium text-gray-600">Contact</th>
              <th className="px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 font-medium text-gray-600">Created At</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right w-72">Individual Assign</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">Loading unassigned leads...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">No unassigned leads found! 🎉</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className={`hover:bg-muted/30 transition-colors ${selectedLeads.has(lead.id) ? 'bg-blue-50/50' : ''}`}>
                <td className="px-4 py-3">
                  <input 
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={selectedLeads.has(lead.id)}
                    onChange={() => toggleLeadSelection(lead.id)}
                  />
                </td>
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
                <td className="px-4 py-3 text-right opacity-50 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <form onSubmit={(e) => handleAssign(e, lead.id)} className="flex items-center gap-2 justify-end">
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="record_type" value={lead.record_type} />
                    
                    <Select name="sales_rep_id">
                      <SelectTrigger className="w-[150px] h-8 text-xs">
                        <SelectValue placeholder="Select Rep..." />
                      </SelectTrigger>
                      <SelectContent>
                        {salesReps.map(rep => (
                          <SelectItem key={rep.id} value={rep.id}>{rep.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Button type="submit" size="sm" variant="outline" className="h-8" disabled={assigningId === lead.id}>
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
