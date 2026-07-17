'use client'

import { useState } from 'react'
import { updateLeadDetails } from '@/app/sales/actions'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { Card, CardContent } from '@/components/ui/card'
import { Phone, Calendar, Clock, AlertCircle, FileText } from 'lucide-react'
import { AICallButton } from '@/components/sales/ai-call-button'

const PIPELINE_STAGES = [
  'NEW',
  'UNREAD',
  'CONTACT_ATTEMPTED',
  'CONTACTED',
  'QUALIFIED',
  'CONSULTATION_SCHEDULED',
  'CONSULTATION_COMPLETED',
  'CONVERTED',
  'ON_HOLD',
  'LOST'
]

// colors for columns
const STAGE_COLORS: Record<string, string> = {
  'NEW': 'bg-blue-500',
  'UNREAD': 'bg-purple-500',
  'CONTACT_ATTEMPTED': 'bg-yellow-500',
  'CONTACTED': 'bg-orange-500',
  'QUALIFIED': 'bg-teal-500',
  'CONSULTATION_SCHEDULED': 'bg-cyan-500',
  'CONSULTATION_COMPLETED': 'bg-green-400',
  'CONVERTED': 'bg-green-600',
  'ON_HOLD': 'bg-gray-400',
  'LOST': 'bg-red-500',
}

export function ProspectLeadsBoard({ initialLeads }: { initialLeads: any[] }) {
  const formatPhone = (phone: string) => {
    if (!phone) return phone;
    const clean = phone.replace(/\s+/g, '');
    const match = clean.match(/^(\+\d{1,3})(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `${match[1]} ${match[2]}-${match[3]}-${match[4]}`;
    }
    const fallbackMatch = clean.match(/^(\+\d{1,3})(\d+)$/);
    if (fallbackMatch) {
      return `${fallbackMatch[1]} ${fallbackMatch[2]}`;
    }
    return phone;
  }

  const [leads, setLeads] = useState(initialLeads)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedLeadId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault()
    if (!draggedLeadId) return
    
    // Find the lead
    const leadToUpdate = leads.find(l => l.id === draggedLeadId)
    if (!leadToUpdate || leadToUpdate.status === newStage) return

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === draggedLeadId ? { ...l, status: newStage } : l))
    
    // API Call
    try {
      const formData = new FormData()
      formData.append('lead_id', draggedLeadId)
      formData.append('status', newStage)
      await updateLeadDetails(formData)
    } catch (error) {
      console.error('Failed to update status', error)
      // Revert on failure
      setLeads(initialLeads)
    }
    
    setDraggedLeadId(null)
  }

  const leadsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = leads.filter(l => l.status === stage) || []
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="flex gap-4 w-max h-full pb-6 items-start px-1 pr-8">
      {PIPELINE_STAGES.map(stage => (
        <div 
          key={stage} 
          className="w-[280px] shrink-0 flex flex-col bg-white rounded-xl border border-gray-200/50 shadow-sm max-h-full overflow-hidden transition-all duration-300 hover:shadow-md hover:border-gray-300/80"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, stage)}
        >
          {/* Column Header */}
          <div className="p-3 border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-white shrink-0">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shadow-sm ${STAGE_COLORS[stage] || 'bg-gray-400'}`} />
                <h3 className="font-bold text-gray-800 text-xs tracking-wide uppercase">{stage.replace(/_/g, ' ')}</h3>
              </div>
              <span className="bg-gray-100/80 text-gray-600 font-bold text-[10px] py-0.5 px-2 rounded-full border border-gray-200/60 shadow-sm">
                {leadsByStage[stage].length}
              </span>
            </div>
          </div>
          
          {/* Column Body */}
          <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5 bg-gray-50/40 min-h-[150px]">
            {leadsByStage[stage].map(u => (
              <div 
                key={u.id}
                draggable
                onDragStart={(e) => handleDragStart(e, u.id)}
                className="cursor-grab active:cursor-grabbing transform transition-transform hover:-translate-y-0.5"
              >
                  <Card className="hover:border-primary/40 hover:shadow-md transition-all duration-300 border-gray-200/70 group bg-white overflow-hidden rounded-lg relative">
                    <div className={`h-0.5 w-full ${STAGE_COLORS[u.status] || 'bg-gray-300'}`} />
                    
                    <div className="absolute top-2.5 right-2 z-10">
                      <UserManagementSheet 
                        lead={u} 
                        defaultTab="files"
                        onLeadUpdate={(updatedLead) => setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l))}
                      >
                        <button 
                          type="button" 
                          className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Open Notes & Symptoms"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </UserManagementSheet>
                    </div>

                    <UserManagementSheet 
                      lead={u}
                      onLeadUpdate={(updatedLead) => setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l))}
                    >
                      <div className="w-full text-left outline-none cursor-pointer">
                        <CardContent className="p-3 flex flex-col gap-2.5">
                          <div className="flex justify-between items-start gap-1 pr-6">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 group-hover:text-primary transition-colors text-[13px] leading-tight truncate tracking-wide">
                                {u.name || formatPhone(u.phone)}
                              </p>
                              {u.name && <p className="text-[11px] text-gray-500 font-bold mt-0.5 truncate tracking-wide">{formatPhone(u.phone)}</p>}
                            </div>
                            <div className="flex gap-1 items-center">
                              {u.priority === 'HIGH' && (
                                <span className="bg-red-50 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 flex items-center gap-1 shrink-0 shadow-sm">
                                  <AlertCircle className="w-2.5 h-2.5" /> HIGH
                                </span>
                              )}
                              <AICallButton leadId={u.id} compact={true} />
                            </div>
                          </div>
                          
                          {(u.plans || u.next_followup_date) && (
                            <div className="pt-2.5 border-t border-gray-100/80 flex flex-wrap gap-1.5 items-center justify-between">
                              {u.plans ? (
                                <span className="inline-flex text-[9px] uppercase font-bold tracking-wider bg-indigo-50/80 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 shadow-sm truncate max-w-[120px]">
                                  {u.plans.name}
                                </span>
                              ) : <span />}
                              
                              {u.next_followup_date && (
                                <span className="text-[10px] font-semibold text-amber-700 flex items-center bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shadow-sm shrink-0">
                                  <Clock className="w-2.5 h-2.5 mr-1 text-amber-500" />
                                  {new Date(u.next_followup_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </div>
                    </UserManagementSheet>
                  </Card>
              </div>
            ))}
            
            {leadsByStage[stage].length === 0 && (
              <div className="flex items-center justify-center h-16 border-2 border-dashed border-gray-200/60 rounded-lg bg-gray-50/50">
                <span className="text-[11px] font-semibold text-gray-400">Drop here</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
