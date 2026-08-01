'use client'

import { useState, useEffect, useRef } from 'react'
import { getPaginatedLeads } from './actions'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu'
import { buttonVariants } from '@/components/ui/button'
import { ChevronDown, Filter, Settings2 } from 'lucide-react'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { AICallButton } from '@/components/sales/ai-call-button'

export default function RecentLeadsTable({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(initialLeads.length)
  const limit = 5
  
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [debouncedSearch, setDebouncedSearch] = useState('')
  
  const isInitialMount = useRef(true)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      if (!isInitialMount.current) {
        setPage(1) // reset to page 1 on search change
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const statusParam = selectedStatuses.length > 0 ? selectedStatuses.join(',') : ''
      const response = await getPaginatedLeads(page, limit, 'created_at', sortOrder, debouncedSearch, '', statusParam)
      if (response && response.data) {
        setLeads(response.data)
        setTotal(response.total || 0)
      }
    } catch (error) {
      console.error('Error fetching leads:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch when dependencies change
  useEffect(() => {
    fetchLeads()
  }, [page, sortOrder, debouncedSearch, selectedStatuses])

  const toggleSort = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
    setPage(1) // reset to page 1
  }

  const toggleStatus = (val: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(val)) {
        return prev.filter(s => s !== val)
      }
      return [...prev, val]
    })
    setPage(1)
  }

  const STATUS_OPTIONS = [
    { value: 'NEW', label: 'New' },
    { value: 'QUALIFIED', label: 'Qualified' },
    { value: 'CONSULTATION_SCHEDULED', label: 'Scheduled' }
  ]

  const getBadgeInfo = (status: string) => {
    if (status === 'NEW' || status === 'UNREAD') {
      return { color: 'bg-[#f3e8ff] text-[#9333ea]', label: 'New Lead' }
    } else if (status === 'QUALIFIED') {
      return { color: 'bg-[#dcfce7] text-[#16a34a]', label: 'Interested' }
    } else if (status === 'CONSULTATION_SCHEDULED') {
      return { color: 'bg-[#dbeafe] text-[#2563eb]', label: 'Scheduled' }
    }
    return { color: 'bg-[#f3f4f6] text-[#4b5563]', label: status }
  }

  return (
    <section className="bg-white border border-[#e5e7eb] rounded-xl p-4 md:p-5 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-3">
        <div className="text-base font-semibold">My Recent Leads</div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <input 
            type="text"
            placeholder="Search name or phone..."
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 min-w-0 md:w-[200px] md:flex-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" }) + " h-[34px] border-gray-300 shrink-0"}>
              <Filter className="w-3 h-3 mr-2" />
              {selectedStatuses.length === 0 ? "All" : `${selectedStatuses.length}`}
              <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedStatuses.length === 0}
                  onCheckedChange={() => {
                    setSelectedStatuses([])
                    setPage(1)
                  }}
                >
                  All Statuses
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {STATUS_OPTIONS.map(opt => (
                  <DropdownMenuCheckboxItem
                    key={opt.value}
                    checked={selectedStatuses.includes(opt.value)}
                    onCheckedChange={() => toggleStatus(opt.value)}
                  >
                    {opt.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button 
            onClick={toggleSort}
            className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 px-3 rounded-md transition-colors flex items-center gap-1 shrink-0"
          >
            Date {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      <div className="relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Lead ID</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Name</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Date</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Mobile</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Source</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Status</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Next Follow-up</th>
                <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: any) => {
                const { color: badgeColor, label: displayStatus } = getBadgeInfo(lead.status)
                return (
                  <tr key={lead.id}>
                    <td className="py-[15px] border-b border-gray-100 text-[#1a1d20] font-mono text-xs">{(lead.id || "").substring(0,8)}</td>
                    <td className="py-[15px] border-b border-gray-100 text-[#1a1d20]">{lead.name || '-'}</td>
                    <td className="py-[15px] border-b border-gray-100 text-[#6b7280]">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="py-[15px] border-b border-gray-100 text-[#6b7280]">
                      <div className="flex items-center gap-2">
                        <span>{lead.phone}</span>
                        {lead.phone && (
                          <a 
                            href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-6 h-6 rounded-full bg-[#22c55e] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                            title="Chat on WhatsApp"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-[15px] border-b border-gray-100 text-[#6b7280]">{lead.user_sources?.name || 'Others'}</td>
                    <td className="py-[15px] border-b border-gray-100 text-[#6b7280]">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badgeColor}`}>{displayStatus}</span>
                    </td>
                    <td className="py-[15px] border-b border-gray-100 text-[#1a1d20]">
                      {lead.next_followup_date ? new Date(lead.next_followup_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                    </td>
                    <td className="py-[15px] border-b border-gray-100 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <AICallButton leadId={lead.id} compact={true} />
                        <UserManagementSheet lead={lead}>
                          <button className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-900 py-1.5 px-3 rounded-md transition-colors inline-flex items-center gap-1">
                            <Settings2 className="w-3.5 h-3.5" /> Manage
                          </button>
                        </UserManagementSheet>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-[30px] text-center text-gray-400">No leads found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col gap-3 pt-2">
          {leads.map((lead: any) => {
            const { color: badgeColor, label: displayStatus } = getBadgeInfo(lead.status)
            return (
              <div key={lead.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Top stripe + identity */}
                <div className="flex items-stretch">
                  {/* Color accent bar */}
                  <div className="w-1 shrink-0 bg-gradient-to-b from-blue-500 to-indigo-500" />
                  {/* Content */}
                  <div className="flex-1 px-4 pt-3 pb-3">
                    <p className="font-bold text-base text-gray-900 leading-tight">{lead.name || '—'}</p>
                    <p className="text-[11px] text-gray-400 font-mono mt-0.5">#{(lead.id || '').substring(0, 8)}</p>
                    <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeColor}`}>
                      {displayStatus}
                    </span>
                  </div>
                </div>

                {/* Info rows */}
                <div className="border-t border-gray-100">
                  {/* Phone row */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <span className="text-xs text-gray-400 w-24 shrink-0">Phone</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-800">{lead.phone || '—'}</span>
                      {lead.phone && (
                        <a
                          href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-5 h-5 rounded-full bg-[#22c55e] text-white flex items-center justify-center hover:opacity-80 shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                  {/* Source row */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <span className="text-xs text-gray-400 w-24 shrink-0">Source</span>
                    <span className="text-xs font-semibold text-gray-800 text-right">{lead.user_sources?.name || 'Others'}</span>
                  </div>
                  {/* Date row */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <span className="text-xs text-gray-400 w-24 shrink-0">Added on</span>
                    <span className="text-xs font-semibold text-gray-800">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                  {/* Follow-up row */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-400 w-24 shrink-0">Follow-up</span>
                    <span className={`text-xs font-semibold ${lead.next_followup_date ? 'text-amber-600' : 'text-gray-400'}`}>
                      {lead.next_followup_date
                        ? new Date(lead.next_followup_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'Not scheduled'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
                  <AICallButton leadId={lead.id} compact={true} />
                  <UserManagementSheet lead={lead}>
                    <button className="flex-1 text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-2 px-3 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 shadow-sm">
                      <Settings2 className="w-3.5 h-3.5" /> Manage Lead
                    </button>
                  </UserManagementSheet>
                </div>
              </div>
            )
          })}
          {leads.length === 0 && (
            <div className="py-10 text-center text-gray-400 text-sm">No leads found.</div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mt-5">
        <span className="text-xs text-gray-500">
          Showing {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
        </span>
        <div className="flex gap-2">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs border border-gray-300 rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <button 
            onClick={() => setPage(p => p + 1)}
            disabled={page * limit >= total}
            className="text-xs border border-gray-300 rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
