'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
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
  Activity
} from 'lucide-react'
import { logout } from '@/app/auth/actions'

const routes = [
  { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  { name: 'Staff Management', path: '/admin/staffs', icon: Users },
  { name: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck },
  { name: 'Inventory', path: '/admin/inventory', icon: Box },
  { name: 'Logistics', path: '/admin/logistics', icon: Truck },
  { name: 'Doctors', path: '/admin/doctors', icon: Stethoscope },
  { name: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
  { name: 'Audit Logs', path: '/admin/logs', icon: Activity },
  { name: 'CRM Settings', path: '/admin/crm-settings', icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-card text-foreground border-r border-border min-h-screen shrink-0 relative">
      {/* Brand Gradient Top Border */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-br from-[var(--color-brand-green)] to-[var(--color-brand-teal)]"></div>
      
      <div className="flex items-center justify-center h-20 border-b border-border/50 shrink-0 mt-1 transition-transform hover:scale-105 duration-500">
        <Image src="/genestac.webp" alt="Genestac Logo" width={100} height={28} className="object-contain dark:invert drop-shadow-md" />
      </div>
      
      <div className="flex flex-col flex-1 overflow-y-auto mt-4 px-3 space-y-1">
        {routes.map((route) => {
          const isActive = pathname === route.path
          return (
            <Link
              key={route.path}
              href={route.path}
              className={`flex items-center px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <route.icon className="w-5 h-5 mr-3" />
              <span>{route.name}</span>
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-border shrink-0">
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center px-4 py-3 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" />
            <span className="font-medium">Logout</span>
          </button>
        </form>
      </div>
    </div>
  )
}
