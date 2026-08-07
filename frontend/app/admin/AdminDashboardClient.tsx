"use client"

import { Users, UserPlus, ShieldCheck, IndianRupee, Activity, FileText, ArrowRight, ShoppingCart, TrendingUp } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import WhatsappReportConfig from './WhatsappReportConfig'

export default function AdminDashboardClient({ metrics }: { metrics: any }) {
  const { 
    total_users, total_leads, total_staff, total_revenue, 
    todays_orders_count, todays_orders_revenue, todays_conversions,
    daily_leads_graph, monthly_leads_graph, funnel_graph, contacted_graph,
    source_graph, recent_activity 
  } = metrics

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f43f5e', '#84cc16'];

  return (
    <div className="space-y-8 p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Analytics</h1>
          <p className="text-gray-500 mt-1">Deep analytics and today's pulse of the platform.</p>
        </div>
      </div>

      {/* KPI Cards row 1 - Today's Pulse */}
      <h2 className="text-lg font-semibold text-gray-700 mt-8 mb-4">Today's Pulse</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-blue-600/80 uppercase tracking-wider">Today's Orders</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">{todays_orders_count || 0}</h3>
              <p className="text-sm text-gray-500 mt-1">Revenue: ₹{todays_orders_revenue?.toLocaleString() || 0}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-emerald-600/80 uppercase tracking-wider">Today's Conversions</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">{todays_conversions || 0}</h3>
              <p className="text-sm text-gray-500 mt-1">New patients onboarded today</p>
            </div>
            <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards row 2 - All Time */}
      <h2 className="text-lg font-semibold text-gray-700 mt-8 mb-4">All Time Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm group">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Revenue</p>
          <div className="flex items-center">
            <IndianRupee className="w-5 h-5 text-gray-400 mr-2" />
            <h3 className="text-2xl font-bold text-gray-900">₹{total_revenue?.toLocaleString() || 0}</h3>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm group">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Users</p>
          <div className="flex items-center">
            <Users className="w-5 h-5 text-gray-400 mr-2" />
            <h3 className="text-2xl font-bold text-gray-900">{total_users || 0}</h3>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm group">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Leads</p>
          <div className="flex items-center">
            <UserPlus className="w-5 h-5 text-gray-400 mr-2" />
            <h3 className="text-2xl font-bold text-gray-900">{total_leads || 0}</h3>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm group">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Active Staff</p>
          <div className="flex items-center">
            <ShieldCheck className="w-5 h-5 text-gray-400 mr-2" />
            <h3 className="text-2xl font-bold text-gray-900">{total_staff || 0}</h3>
          </div>
        </div>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Daily Leads Chart */}
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Daily Incoming Leads (Last 30 Days)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily_leads_graph}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: "#3b82f6"}} activeDot={{r: 8}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Leads Chart */}
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Monthly Incoming Leads (Last 12 Months)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly_leads_graph}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="month" tick={{fontSize: 12}} tickMargin={10} />
                <YAxis allowDecimals={false} />
                <Tooltip cursor={{fill: '#f3f4f6'}} />
                <Bar dataKey="leads" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Conversion Funnel</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel_graph} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="stage" type="category" tick={{fontSize: 12}} />
                <Tooltip cursor={{fill: '#f3f4f6'}} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]}>
                  {funnel_graph?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown Ratio */}
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Lead Status Breakdown</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={contacted_graph}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {contacted_graph?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source Breakdown Ratio */}
        <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Lead Source Breakdown</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={source_graph}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {source_graph?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* WhatsApp Report Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <WhatsappReportConfig />
      </div>

    </div>
  )
}

