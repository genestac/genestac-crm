'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
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
  MessageCircle,
  Terminal,
  Bot,
  PhoneCall,
  ListOrdered,
  ChevronDown,
  ChevronRight,
  Star,
  Megaphone,
  Bell
} from 'lucide-react'
import { logout } from '@/app/auth/actions'

type RouteItem = {
  name: string
  path: string
  icon: React.ElementType
  subItems?: { name: string; path: string; hash?: string; icon: React.ElementType }[]
}

const modules: { title: string; routes: RouteItem[] }[] = [
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
      { name: 'Reviews', path: '/admin/reviews', icon: Star },
      { name: 'Logistics', path: '/admin/logistics', icon: Truck },
    ]
  },
  {
    title: 'Marketing',
    routes: [
      { name: 'WhatsApp Campaigns', path: '/admin/whatsapp', icon: MessageCircle },
      { name: 'WhatsApp Inbox', path: '/admin/whatsapp-inbox', icon: MessageCircle },
      { name: 'Push Notifications', path: '/admin/push-notifications', icon: Megaphone },
    ]
  },
  {
    title: 'CRM & Health',
    routes: [
      { name: 'Lead Settings', path: '/admin/lead-settings', icon: Settings },
      { name: 'Lead Assignment', path: '/admin/lead-assignment', icon: Users },
      { name: 'Proforma Invoices', path: '/admin/proforma-invoices', icon: FileText },
      { name: 'Doctors', path: '/admin/doctors', icon: Stethoscope },
      { name: 'Consultations', path: '/admin/consultations', icon: FileText },
      { name: 'Medical Plans', path: '/admin/plans', icon: CreditCard },
      { name: 'Subscriptions', path: '/admin/subscriptions', icon: FileText },
    ]
  },
  {
    title: 'System & Security',
    routes: [
      { name: 'Staff Management', path: '/admin/staffs', icon: Users },
      { name: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck },
      { name: 'Audit Logs', path: '/admin/logs', icon: Activity },
      { name: 'System Logs', path: '/admin/system-logs', icon: Terminal },
    ]
  },
  {
    title: 'Settings',
    routes: [
      { name: 'Coupons', path: '/admin/coupons', icon: Settings },
      { name: 'Invoice Settings', path: '/admin/invoice-settings', icon: Settings },
      { name: 'Custom Fields', path: '/admin/custom-fields', icon: Settings },
      {
        name: 'AI Voice Calling',
        path: '/admin/ai-calling',
        icon: Bot,
        subItems: [
          { name: 'Settings', path: '/admin/ai-calling', icon: Settings },
          { name: 'Call Logs', path: '/admin/ai-calling?tab=logs', icon: PhoneCall },
          { name: 'Call Queue', path: '/admin/ai-calling?tab=queue', icon: ListOrdered },
        ]
      },
    ]
  }
]

export function AdminSidebar() {
  const pathname = usePathname()
  const [isPinned, setIsPinned] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [expandedItems, setExpandedItems] = useState<string[]>(['/admin/ai-calling'])
  const [flyout, setFlyout] = useState<{ route: RouteItem; top: number } | null>(null)
  const flyoutTimeout = useRef<NodeJS.Timeout | null>(null)

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

  const toggleExpand = (path: string) => {
    setExpandedItems(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  const showFlyout = (route: RouteItem, e: React.MouseEvent) => {
    if (!isCollapsed || !route.subItems) return
    if (flyoutTimeout.current) clearTimeout(flyoutTimeout.current)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setFlyout({ route, top: rect.top })
  }

  const hideFlyout = () => {
    flyoutTimeout.current = setTimeout(() => setFlyout(null), 150)
  }

  const keepFlyout = () => {
    if (flyoutTimeout.current) clearTimeout(flyoutTimeout.current)
  }

  return (
    <div 
      className={`flex flex-col bg-card text-foreground border-r border-border min-h-screen shrink-0 relative transition-[width] duration-300 z-20 ${isCollapsed ? 'w-20' : 'w-64'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); hideFlyout() }}
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
                const isActive = pathname === route.path || pathname.startsWith(route.path + '/')
                const hasSubItems = !!route.subItems
                const isExpanded = expandedItems.includes(route.path)

                return (
                  <div key={route.path}>
                    {/* Main route item */}
                    {hasSubItems ? (
                      <button
                        onClick={() => isCollapsed ? undefined : toggleExpand(route.path)}
                        onMouseEnter={(e) => showFlyout(route, e)}
                        onMouseLeave={hideFlyout}
                        className={`w-full flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 ${
                          isActive 
                            ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <route.icon className="w-5 h-5 mr-3 shrink-0" />
                        <span className={`text-sm whitespace-nowrap flex-1 text-left transition-opacity duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                          {route.name}
                        </span>
                        {!isCollapsed && (
                          isExpanded 
                            ? <ChevronDown className="w-4 h-4 shrink-0 opacity-60" /> 
                            : <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                        )}
                      </button>
                    ) : (
                      <Link
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
                    )}

                    {/* Inline sub-items (expanded sidebar only) */}
                    {hasSubItems && !isCollapsed && isExpanded && (
                      <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-3">
                        {route.subItems!.map((sub) => (
                          <Link
                            key={sub.path}
                            href={sub.path}
                            className="flex items-center px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <sub.icon className="w-4 h-4 mr-2 shrink-0" />
                            {sub.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
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

      {/* Flyout popup for collapsed sidebar */}
      {flyout && isCollapsed && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-2 min-w-[180px]"
          style={{ left: '76px', top: flyout.top }}
          onMouseEnter={keepFlyout}
          onMouseLeave={hideFlyout}
        >
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400">{flyout.route.name}</p>
          {flyout.route.subItems!.map((sub) => (
            <Link
              key={sub.path}
              href={sub.path}
              className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              onClick={() => setFlyout(null)}
            >
              <sub.icon className="w-4 h-4 mr-2 shrink-0" />
              {sub.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
