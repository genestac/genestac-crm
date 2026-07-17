'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Calendar, Mail, Phone, Settings2, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Search, Filter, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu'
import { UserStatusUpdater } from '@/components/sales/user-status-updater'
import { UserManagementSheet } from '@/components/sales/user-management-sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { AICallButton } from '@/components/sales/ai-call-button'
import { useRouter } from 'next/navigation'
import { getPaginatedLeads, bulkUpdateLeadsStatus } from '@/app/sales/actions'
import { toast } from 'sonner'

export function LeadsTable({ initialLeads, initialTotal, statusOptions, sourceOptions = [] }: { initialLeads: any[], initialTotal: number, statusOptions: {value: string, label: string}[], sourceOptions?: {value: string, label: string}[] }) {
  const [leads, setLeads] = useState(initialLeads)
  const [total, setTotal] = useState(initialTotal)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  type SortColumn = 'name' | 'created_at' | 'next_followup_date' | 'status' | 'source_id'
  type SortDirection = 'asc' | 'desc' | null

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // Default matches the server-side fetch in page.tsx
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['NEW', 'UNREAD', 'CONTACT_ATTEMPTED'])
  const [selectedSource, setSelectedSource] = useState<string>('')
  const isInitialMount = useRef(true)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      if (!isInitialMount.current) setCurrentPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const sortBy = sortColumn || 'created_at'
      const order = sortDirection || 'desc'
      const statusParam = selectedStatuses.length > 0 ? selectedStatuses.join(',') : ''
      const response = await getPaginatedLeads(currentPage, pageSize, sortBy, order, debouncedSearch, selectedSource, statusParam)
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

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    fetchLeads()
    // Reset selected leads on fetch to avoid acting on invisible leads
    setSelectedLeadIds([])
  }, [currentPage, pageSize, sortColumn, sortDirection, debouncedSearch, selectedStatuses, selectedSource])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else if (sortDirection === 'desc') {
        setSortDirection(null)
        setSortColumn(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1) // Reset to first page on sort
  }

  const toggleStatus = (val: string) => {
    toast.info(`Toggling status: ${val}`)
    setSelectedStatuses(prev => {
      if (prev.includes(val)) {
        return prev.filter(s => s !== val)
      }
      return [...prev, val]
    })
    setCurrentPage(1)
  }

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400 inline cursor-pointer" />
    if (sortDirection === 'asc') return <ArrowUp className="w-3 h-3 ml-1 text-blue-600 inline cursor-pointer" />
    return <ArrowDown className="w-3 h-3 ml-1 text-blue-600 inline cursor-pointer" />
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeadIds(leads.map(l => l.id))
    } else {
      setSelectedLeadIds([])
    }
  }

  const handleSelectLead = (id: string) => {
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(leadId => leadId !== id) : [...prev, id]
    )
  }

  const handleBulkUpdateStatus = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetStatus = e.target.value
    if (!targetStatus || selectedLeadIds.length === 0) return

    setIsUpdating(true)
    try {
      // Optimistically update UI
      setLeads(prev => prev.map(lead => 
        selectedLeadIds.includes(lead.id) ? { ...lead, status: targetStatus } : lead
      ))
      
      await bulkUpdateLeadsStatus(selectedLeadIds, targetStatus)
      
      // Re-fetch to get correct status
      fetchLeads()
      setSelectedLeadIds([])
      router.refresh()
      toast.success('Status updated for selected leads.')
    } catch (error) {
      console.error('Failed to bulk update status:', error)
      toast.error('Failed to update status for selected leads.')
    } finally {
      setIsUpdating(false)
      e.target.value = "" // reset select
    }
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col">
      {/* Filters Header */}
      <div className="p-4 border-b flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-50/50">
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-auto flex flex-wrap items-center gap-2">
          {sourceOptions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" }) + " h-[38px] border-gray-300 w-full sm:w-auto justify-between"}>
                <div className="flex items-center">
                  <Filter className="w-4 h-4 mr-2 text-gray-500" />
                  {selectedSource ? sourceOptions.find(s => s.value === selectedSource)?.label || 'All Sources' : 'All Sources'}
                </div>
                <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Filter by Source</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedSource === ''}
                    onCheckedChange={() => {
                      setSelectedSource('')
                      setCurrentPage(1)
                    }}
                  >
                    All Sources
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <div className="max-h-[300px] overflow-y-auto">
                    {sourceOptions.map(opt => (
                      <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={selectedSource === opt.value}
                        onCheckedChange={() => {
                          setSelectedSource(opt.value)
                          setCurrentPage(1)
                        }}
                      >
                        {opt.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" }) + " h-[38px] border-gray-300 w-full sm:w-auto justify-between"}>
              <div className="flex items-center">
                <Filter className="w-4 h-4 mr-2 text-gray-500" />
                {selectedStatuses.length === 0 ? "All Statuses" : `${selectedStatuses.length} Statuses`}
              </div>
              <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[240px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedStatuses.length === 0}
                  onCheckedChange={() => {
                    setSelectedStatuses([])
                    setCurrentPage(1)
                  }}
                >
                  All Statuses
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <div className="max-h-[300px] overflow-y-auto">
                  {statusOptions.map(opt => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={selectedStatuses.includes(opt.value)}
                      onCheckedChange={() => toggleStatus(opt.value)}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Bulk Actions Header */}
      {selectedLeadIds.length > 0 && (
        <div className="bg-blue-50 px-6 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-blue-700">
            {selectedLeadIds.length} lead(s) selected
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Change status to:</span>
            <select 
              onChange={handleBulkUpdateStatus}
              disabled={isUpdating}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              defaultValue=""
            >
              <option value="" disabled>Select status...</option>
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="overflow-x-auto relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  checked={selectedLeadIds.length > 0 && selectedLeadIds.length === leads.length && leads.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              <th className="px-6 py-4 font-medium text-gray-900 cursor-pointer select-none" onClick={() => handleSort('name')}>
                <div className="flex items-center">User Details <SortIcon column="name" /></div>
              </th>
              <th className="px-6 py-4 font-medium text-gray-900 cursor-pointer select-none" onClick={() => handleSort('created_at')}>
                <div className="flex items-center">Date <SortIcon column="created_at" /></div>
              </th>
              <th className="px-6 py-4 font-medium text-gray-900">Contact</th>
              <th className="px-6 py-4 font-medium text-gray-900 cursor-pointer select-none" onClick={() => handleSort('source_id')}>
                <div className="flex items-center">Source & Plan <SortIcon column="source_id" /></div>
              </th>
              <th className="px-6 py-4 font-medium text-gray-900 cursor-pointer select-none" onClick={() => handleSort('next_followup_date')}>
                <div className="flex items-center">Next Follow-up <SortIcon column="next_followup_date" /></div>
              </th>
              <th className="px-6 py-4 font-medium text-gray-900 cursor-pointer select-none" onClick={() => handleSort('status')}>
                <div className="flex items-center">Status <SortIcon column="status" /></div>
              </th>
              <th className="px-6 py-4 font-medium text-gray-900 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((lead: any) => (
              <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    checked={selectedLeadIds.includes(lead.id)}
                    onChange={() => handleSelectLead(lead.id)}
                  />
                </td>
                
                {/* User Details */}
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-900">{lead.name || 'Unnamed User'}</div>
                  <div className="text-xs text-gray-500 mt-1">ID: {lead.id.substring(0, 8)}</div>
                </td>

                {/* Date */}
                <td className="px-6 py-4 text-gray-600">
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                </td>

                {/* Contact */}
                <td className="px-6 py-4">
                  <div className="flex items-center text-gray-700">
                    <Phone className="w-3 h-3 mr-2 text-gray-400" />
                    {lead.phone}
                  </div>
                  {lead.email && (
                    <div className="flex items-center text-gray-500 text-xs mt-1">
                      <Mail className="w-3 h-3 mr-2 text-gray-400" />
                      {lead.email}
                    </div>
                  )}
                </td>

                {/* Source & Plan */}
                <td className="px-6 py-4">
                  <div className="text-gray-900 font-medium text-xs uppercase tracking-wider">
                    {lead.user_sources?.name || 'Unknown'}
                  </div>
                  <div className="text-indigo-600 text-xs mt-1 font-medium">
                    {lead.plans?.name || 'No Plan Selected'}
                  </div>
                </td>

                {/* Next Follow-up */}
                <td className="px-6 py-4">
                  {lead.next_followup_date ? (
                    <div className="flex items-center text-amber-700 bg-amber-50 px-2 py-1 rounded w-fit border border-amber-200">
                      <Calendar className="w-3 h-3 mr-2" />
                      {new Date(lead.next_followup_date).toLocaleString([], { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs italic">Not scheduled</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <UserStatusUpdater leadId={lead.id} currentStatus={lead.status} recordType={lead.record_type} statusOptions={statusOptions} />
                </td>

                {/* Actions */}
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    {lead.phone && (
                      <a 
                        href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-full bg-[#22c55e] text-white flex items-center justify-center hover:bg-[#16a34a] transition-colors shadow-sm"
                        title="Chat on WhatsApp"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                      </a>
                    )}
                    
                    <AICallButton leadId={lead.id} compact={true} />
                    
                    <UserManagementSheet lead={lead} statusOptions={statusOptions}>
                      <Button variant="secondary" size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-900">
                        <Settings2 className="w-4 h-4 mr-2" /> Manage
                      </Button>
                    </UserManagementSheet>
                  </div>
                </td>
                
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <span className="text-2xl">🎉</span>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">No leads found</h3>
                    <p className="text-gray-500 mt-1 max-w-sm">Try adjusting your filters or search query.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      <div className="bg-gray-50 px-6 py-3 border-t flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select 
              className="border-gray-300 rounded shadow-sm py-1 pl-2 pr-6 text-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>entries</span>
          </div>
          <span className="hidden sm:inline">
            Showing {total === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} leads
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="h-8 px-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 mx-2">
            Page {currentPage} of {totalPages === 0 ? 1 : totalPages}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="h-8 px-2"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
