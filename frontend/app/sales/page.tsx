import { fetchAPI } from '@/utils/api'
import { Bell } from 'lucide-react'

export default async function SalesDashboard() {
  const metrics = await fetchAPI('/api/sales/metrics')
  
  const totalLeads = metrics.totalLeads || 0
  const newLeadsToday = metrics.newLeadsToday || 0
  const followUpsDueCount = metrics.followUpsDueCount || 0
  const appointmentsBooked = metrics.appointmentsBooked || 0
  const convertedCount = metrics.convertedCount || 0
  const revenueGenerated = metrics.revenueGenerated || 0
  const monthlyTarget = metrics.monthlyTarget || 1000000
  const achievementPercentage = metrics.achievementPercentage || 0
  
  const leadsSummaryArray = metrics.leadsSummaryArray || []
  const conicGradient = metrics.conicGradient || 'conic-gradient(#d1d5db 0% 100%)'
  const topLeadSources = metrics.topLeadSources || []
  
  const recentLeads = metrics.recentLeads || []
  const timelineEvents = metrics.timelineEvents || []

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
  }

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-5 font-sans bg-[#f7f9fa] text-[#1a1d20]">
      {/* Header */}
      <header className="flex justify-between items-center pb-2.5 pt-2">
        <h1 className="text-2xl font-semibold">Dashboard Overview</h1>
        <div className="flex gap-4 items-center">
          <div className="border border-[#e5e7eb] px-3 py-2 rounded-md text-sm text-[#6b7280] bg-white cursor-pointer hover:bg-gray-50">
            01 May - 31 May 2024 ▼
          </div>
          <div className="border border-[#e5e7eb] px-3 py-2 rounded-md bg-white cursor-pointer hover:bg-gray-50 text-[#6b7280]">
            <Bell className="w-5 h-5" />
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      <section className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Total Leads</span>
          <span className="text-2xl font-bold">{totalLeads}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">New Leads Today</span>
          <span className="text-2xl font-bold">{newLeadsToday}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Follow-ups Due</span>
          <span className="text-2xl font-bold">{followUpsDueCount}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Appointments Booked</span>
          <span className="text-2xl font-bold">{appointmentsBooked}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Converted Patients</span>
          <span className="text-2xl font-bold">{convertedCount}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Revenue Generated</span>
          <span className="text-2xl font-bold">{formatCurrency(revenueGenerated)}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Monthly Target</span>
          <span className="text-2xl font-bold">{formatCurrency(monthlyTarget)}</span>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-2">
          <span className="text-sm text-[#6b7280] font-medium">Achievement %</span>
          <span className="text-2xl font-bold">{achievementPercentage}%</span>
          <div className="w-full bg-[#e5e7eb] h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(achievementPercentage, 100)}%` }}></div>
          </div>
        </div>
      </section>

      {/* Middle Section (Charts) */}
      <section className="grid grid-cols-2 gap-5">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="text-base font-semibold mb-5">Leads Summary</div>
          <div className="flex items-center gap-10">
            <div 
              className="w-[150px] h-[150px] rounded-full flex items-center justify-center shrink-0"
              style={{ background: conicGradient }}
            >
              <div className="w-[110px] h-[110px] bg-white rounded-full flex flex-col items-center justify-center">
                <h3 className="text-2xl font-bold">{totalLeads}</h3>
                <span className="text-xs text-[#6b7280]">Total Leads</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 text-[13px] text-[#6b7280] w-full pr-4">
              {leadsSummaryArray.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    {item.label}
                  </div>
                  <span>{item.percentage}%</span>
                </div>
              ))}
              {leadsSummaryArray.length === 0 && (
                <span className="text-center text-gray-400 mt-4">No leads found</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="text-base font-semibold mb-5">Top Lead Sources</div>
          <div className="flex flex-col gap-[15px]">
            {topLeadSources.map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[13px] text-[#6b7280]">
                <span className="w-[120px] truncate">{item.label}</span>
                <div className="grow bg-transparent h-2 rounded-full mx-[15px] flex">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${item.percentage}%` }}></div>
                </div>
                <span className="w-[30px] text-right">{item.percentage}%</span>
              </div>
            ))}
            {topLeadSources.length === 0 && (
              <span className="text-center text-gray-400 mt-8">No sources found</span>
            )}
          </div>
        </div>
      </section>

      {/* Table Section */}
      <section className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
        <div className="text-base font-semibold mb-5">My Recent Leads</div>
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr>
              <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Lead ID</th>
              <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Name</th>
              <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Mobile</th>
              <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Source</th>
              <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Status</th>
              <th className="py-3 text-[#1a1d20] font-semibold border-b border-[#e5e7eb]">Next Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {recentLeads.map((lead: any) => {
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
            {recentLeads.length === 0 && (
              <tr>
                <td colSpan={6} className="py-[30px] text-center text-gray-400">No recent leads found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Bottom Section */}
      <section className="grid grid-cols-2 gap-5 mb-8">
        {/* Calendar */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="text-base font-semibold mb-5">Follow-up Calendar</div>
          <div className="flex justify-between mb-[15px] font-semibold text-sm">
            <span className="cursor-pointer">&lt;</span>
            <span>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            <span className="cursor-pointer">&gt;</span>
          </div>
          <div className="flex justify-between text-[13px] text-[#6b7280] mb-[15px]">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date()
              d.setDate(d.getDate() - d.getDay() + i)
              const isToday = d.toDateString() === new Date().toDateString()
              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  <span>{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <span className={`w-[30px] h-[30px] flex items-center justify-center rounded-full ${isToday ? 'bg-blue-500 text-white' : ''}`}>
                    {d.getDate()}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="bg-gray-50 rounded-lg p-[15px] flex flex-col gap-[15px] text-[13px] min-h-[120px]">
            {timelineEvents.map((event: any, i: number) => (
              <div key={i} className="flex gap-[15px]">
                <span className="text-[#6b7280] w-[60px]">{event.time}</span>
                <span className="text-[#1a1d20]">{event.title}</span>
              </div>
            ))}
            {timelineEvents.length === 0 && (
              <div className="text-center text-gray-400 py-4">No events scheduled for today.</div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
          <div className="text-base font-semibold mb-5">Quick Actions</div>
          <div className="grid grid-cols-4 gap-5 text-center mt-2.5">
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#dcfce7] text-[#16a34a]">📞</div>
              <span className="text-xs text-[#6b7280] font-medium">Call</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#dcfce7] text-[#22c55e]">💬</div>
              <span className="text-xs text-[#6b7280] font-medium">WhatsApp</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#dbeafe] text-[#3b82f6]">✉️</div>
              <span className="text-xs text-[#6b7280] font-medium">SMS</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#f3f4f6] text-[#3b82f6]">📧</div>
              <span className="text-xs text-[#6b7280] font-medium">Email</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#f3e8ff] text-[#8b5cf6]">👤+</div>
              <span className="text-xs text-[#6b7280] font-medium">Add Lead</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#ffedd5] text-[#f97316]">📅</div>
              <span className="text-xs text-[#6b7280] font-medium">Schedule<br/>Follow-up</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#fce7f3] text-[#ec4899]">📆</div>
              <span className="text-xs text-[#6b7280] font-medium">Book<br/>Appointment</span>
            </div>
            <div className="flex flex-col items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-[50px] h-[50px] rounded-xl flex items-center justify-center text-xl bg-[#fef3c7] text-[#eab308]">📝</div>
              <span className="text-xs text-[#6b7280] font-medium">Add Note</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
