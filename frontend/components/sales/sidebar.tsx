'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { 
  LayoutDashboard, 
  Users, 
  PhoneCall, 
  CalendarCheck, 
  CalendarClock,
  FolderOpen,
  LogOut,
  Kanban,
  FileText,
  ShoppingCart,
  Pin
} from 'lucide-react'
import { logout } from '@/app/auth/actions'

const routes = [
  { name: 'Dashboard', path: '/sales', icon: LayoutDashboard },
  { name: 'Prospect Leads', path: '/sales/pipeline', icon: Kanban },
  { name: 'Leads', path: '/sales/leads', icon: Users },
  { name: 'Follow-ups', path: '/sales/followups', icon: PhoneCall },
  { name: 'Scheduled Calls', path: '/sales/scheduled-calls', icon: CalendarClock },
  { name: 'Contacted', path: '/sales/contacted', icon: FolderOpen },
  { name: 'Templates', path: '/sales/templates', icon: FileText },
  { name: 'Orders', path: '/sales/orders', icon: ShoppingCart },
  { name: 'Abandoned Carts', path: '/sales/carts', icon: ShoppingCart },
]

export function SalesSidebar() {
  const pathname = usePathname()
  const [isPinned, setIsPinned] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const stored = localStorage.getItem('sales-sidebar-pinned')
    if (stored !== null) {
      setIsPinned(stored === 'true')
    }
  }, [])

  const togglePin = () => {
    setIsPinned(!isPinned)
    localStorage.setItem('sales-sidebar-pinned', String(!isPinned))
  }

  const isCollapsed = isMounted ? (!isPinned && !isHovered) : false

  return (
    <div 
      className={`flex flex-col bg-card/95 backdrop-blur-md text-foreground border-r border-border/50 min-h-screen shrink-0 relative shadow-xl z-20 transition-[width] duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Brand Gradient Top Border */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[var(--color-brand-green)] via-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] shadow-[0_0_15px_rgba(29,182,178,0.5)]"></div>
      
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
      
      <div className="flex flex-col flex-1 overflow-y-auto mt-4 px-3 space-y-1">
        {routes.map((route) => {
          const isActive = pathname === route.path
          return (
            <Link
              key={route.path}
              href={route.path}
              className={`group flex items-center px-4 py-3 rounded-xl transition-all duration-300 ease-out relative overflow-hidden ${
                isActive 
                  ? 'text-white shadow-lg shadow-primary/20 scale-[1.02]' 
                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:scale-[1.02]'
              }`}
            >
              {/* Active Gradient Background */}
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] opacity-100 transition-opacity duration-300"></div>
              )}
              
              <route.icon className={`w-5 h-5 mr-3 shrink-0 relative z-10 transition-transform duration-300 ${isActive ? 'text-white scale-110' : 'group-hover:text-[var(--color-brand-teal)] group-hover:scale-110'}`} />
              <span className={`font-medium tracking-wide relative z-10 whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
                {route.name}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-border/50 shrink-0">
        <form action={logout}>
          <button
            type="submit"
            className="group flex w-full items-center px-4 py-3 text-destructive/80 hover:bg-destructive/10 hover:text-destructive rounded-xl transition-all duration-300 hover:scale-[1.02]"
          >
            <LogOut className="w-5 h-5 mr-3 shrink-0 transition-transform group-hover:-translate-x-1" />
            <span className={`font-medium tracking-wide whitespace-nowrap transition-opacity duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
              Logout
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}
