'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { 
  LayoutDashboard, 
  Users, 
  ShieldCheck, 
  Box, 
  Truck, 
  Stethoscope,
  BarChart3,
  LogOut,
  Settings,
  Activity,
  CreditCard,
  ShoppingCart,
  FileText,
  Pin,
  MessageCircle
} from 'lucide-react'
import { logout } from '@/app/auth/actions'

const modules = [
  {
    title: 'Overview',
    routes: [
      { name: 'Analytics', path: '/admin', icon: BarChart3 },
    ]
  },
  {
    title: 'E-Commerce',
    routes: [
      { name: 'Orders', path: '/admin/orders', icon: ShoppingCart },
      { name: 'Abandoned Carts', path: '/admin/carts', icon: ShoppingCart },
      { name: 'Inventory', path: '/admin/inventory', icon: Box },
      { name: 'Logistics', path: '/admin/logistics', icon: Truck },
    ]
  },
  {
    title: 'Marketing',
    routes: [
      { name: 'WhatsApp Campaigns', path: '/admin/whatsapp', icon: MessageCircle },
    ]
  },
  {
    title: 'CRM & Health',
    routes: [
      { name: 'Lead Settings', path: '/admin/lead-settings', icon: Settings },
      { name: 'Lead Assignment', path: '/admin/lead-assignment', icon: Users },
      { name: 'Proforma Invoices', path: '/admin/proforma-invoices', icon: FileText },
      { name: 'Doctors', path: '/admin/doctors', icon: Stethoscope },
      { name: 'Medical Plans', path: '/admin/plans', icon: CreditCard },
    ]
  },
  {
    title: 'System & Security',
    routes: [
      { name: 'Staff Management', path: '/admin/staffs', icon: Users },
      { name: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck },
      { name: 'Audit Logs', path: '/admin/logs', icon: Activity },
    ]
  },
  {
    title: 'Settings',
    routes: [
      { name: 'Coupons', path: '/admin/coupons', icon: Settings },
      { name: 'Invoice Settings', path: '/admin/invoice-settings', icon: Settings },
      { name: 'Custom Fields', path: '/admin/custom-fields', icon: Settings },
      { name: 'AI Voice Calling', path: '/admin/ai-calling', icon: Activity },
    ]
  }
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [isPinned, setIsPinned] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const stored = localStorage.getItem('admin-sidebar-pinned')
    if (stored !== null) {
      setIsPinned(stored === 'true')
    }
  }, [])

  const togglePin = () => {
    setIsPinned(!isPinned)
    localStorage.setItem('admin-sidebar-pinned', String(!isPinned))
  }

  const isCollapsed = isMounted ? (!isPinned && !isHovered) : false

  return (
    <div 
      className={`flex flex-col bg-card text-foreground border-r border-border min-h-screen shrink-0 relative transition-[width] duration-300 z-20 ${isCollapsed ? 'w-20' : 'w-64'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Brand Gradient Top Border */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-br from-[var(--color-brand-green)] to-[var(--color-brand-teal)]"></div>
      
      {/* Pin Button */}
      <button 
        onClick={togglePin}
        className={`absolute top-6 -right-3.5 bg-white border border-gray-200 rounded-full p-1 shadow-md text-gray-400 hover:text-gray-700 transition-all z-30 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
      >
        <Pin className={`w-3.5 h-3.5 transition-transform ${isPinned ? 'rotate-0' : '-rotate-45'}`} />
      </button>

      <div className="flex items-center justify-center h-20 border-b border-border/50 shrink-0 mt-1 transition-transform hover:scale-105 duration-500 overflow-hidden">
        <Image 
          src="/genestac.webp" 
          alt="Genestac Logo" 
          width={100} 
          height={28} 
          priority 
          style={{ height: 'auto' }} 
          className={`object-contain dark:invert drop-shadow-md transition-all duration-300 ${isCollapsed ? 'w-8 h-8 object-cover object-left' : 'w-[100px]'}`} 
        />
      </div>
      
      <div className="flex flex-col flex-1 overflow-y-auto mt-4 px-3 space-y-6 pb-6 scrollbar-thin">
        {modules.map((module) => (
          <div key={module.title} className="space-y-1">
            <h4 className={`px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
              {module.title}
            </h4>
            <div className="space-y-1">
              {module.routes.map((route) => {
                const isActive = pathname === route.path
                return (
                  <Link
                    key={route.path}
                    href={route.path}
                    className={`flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 ${
                      isActive 
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <route.icon className="w-5 h-5 mr-3 shrink-0" />
                    <span className={`text-sm whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                      {route.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border shrink-0">
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center px-4 py-3 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3 shrink-0" />
            <span className={`font-medium whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
              Logout
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}
