import { fetchAPI } from '@/utils/api'
import { Bell } from 'lucide-react'
import { cookies } from 'next/headers'
import RecentLeadsTable from './RecentLeadsTable'
export default async function SalesDashboard() {
  const cookieHeader = (await cookies()).toString()
  const metrics = await fetchAPI('/api/sales/metrics', {
    headers: { Cookie: cookieHeader }
  }).catch(() => ({}))
  
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
      <RecentLeadsTable initialLeads={recentLeads} />

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
