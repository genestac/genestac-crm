'use client'

import { useState, useEffect, useRef } from 'react'
import { getPaginatedLeads } from './actions'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu'
import { buttonVariants } from '@/components/ui/button'
import { ChevronDown, Filter } from 'lucide-react'

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
    { value: 'ASSIGNED', label: 'Assigned' },
    { value: 'CONSULTATION_SCHEDULED', label: 'Scheduled' }
  ]

  return (
    <section className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4">
        <div className="text-base font-semibold">My Recent Leads</div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <input 
            type="text"
            placeholder="Search name or phone..."
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-[200px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" }) + " h-[34px] border-gray-300"}>
              <Filter className="w-3 h-3 mr-2" />
              {selectedStatuses.length === 0 ? "All Statuses" : `${selectedStatuses.length} Statuses`}
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
            className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 px-3 rounded-md transition-colors flex items-center gap-1"
          >
            Sort by Date {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      <div className="relative min-h-[300px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
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
            </tr>
          </thead>
          <tbody>
            {leads.map((lead: any) => {
              let badgeColor = "bg-[#f3f4f6] text-[#4b5563]" // default
              let displayStatus = lead.status
              
              if (lead.status === "NEW" || lead.status === "UNREAD") {
                badgeColor = "bg-[#f3e8ff] text-[#9333ea]"
                displayStatus = "New Lead"
              } else if (lead.status === "QUALIFIED") {
                badgeColor = "bg-[#dcfce7] text-[#16a34a]"
                displayStatus = "Interested"
              } else if (lead.status === "ASSIGNED") {
                badgeColor = "bg-[#fef3c7] text-[#d97706]"
                displayStatus = "Follow-up required"
              } else if (lead.status === "CONSULTATION_SCHEDULED") {
                badgeColor = "bg-[#dbeafe] text-[#2563eb]"
                displayStatus = "Scheduled"
              }

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
                            <path d="M16.6 14c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.2-.5-.5-1-1.1-1.4-1.7-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4.1-.2 0-.4 0-.5C10 9.4 9.4 8 9.3 7.8c-.1-.2-.3-.2-.5-.2h-.4c-.2 0-.5.1-.7.3-.2.2-.7.7-.7 1.6 0 .9.8 1.8 1 2 .1.2 1.3 2.1 3.2 2.9 1.9.8 2.6.8 3.1.8.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.5-.3z"/>
                            <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.4 5l-1.3 4.8 4.9-1.3c1.4.8 3 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-2.9-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8-8 8z"/>
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
                </tr>
              )
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="py-[30px] text-center text-gray-400">No leads found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-5">
        <span className="text-xs text-gray-500">
          Showing {total === 0 ? 0 : (page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} entries
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
