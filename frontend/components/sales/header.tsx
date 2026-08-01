'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, RefreshCw, LayoutDashboard, ChevronDown, ShoppingBag, Settings, Megaphone } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ADMIN_ROLES = ['superadmin', 'master_admin', 'admin', 'SUPER_ADMIN']

export function SalesHeader({ user }: { user?: any }) {
  const role = user?.role || ''
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => {
      setIsRefreshing(false)
    }, 800)
  }

  const isAdminRole = ADMIN_ROLES.includes(role || '')

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-16 md:h-20 pl-16 md:pl-8 pr-3 md:pr-8 bg-card/80 backdrop-blur-xl border-b border-border/50 shrink-0 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 min-w-0">
        {isAdminRole ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "outline" }),
                "flex items-center gap-1.5 h-8 md:h-9 px-2 md:px-4 rounded-full border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary font-medium text-xs md:text-sm shadow-sm transition-all"
              )}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Sales Dashboard</span>
              <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Dashboard</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="flex items-center gap-2 font-medium text-primary bg-primary/5"
                  onClick={() => router.push('/sales')}
                >
                  <ShoppingBag className="w-4 h-4" />
                  Sales Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onClick={() => router.push('/admin')}
                >
                  <Settings className="w-4 h-4" />
                  Admin Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center gap-2"
                  onClick={() => router.push('/digital-marketing')}
                >
                  <Megaphone className="w-4 h-4" />
                  Digital Marketing
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <h2 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] bg-clip-text text-transparent tracking-tight truncate">Sales Hub</h2>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh}
          className="text-foreground hover:bg-muted/80 rounded-full transition-transform hover:scale-105 w-8 h-8 md:w-10 md:h-10"
          title="Refresh Data"
        >
          <RefreshCw className={cn("w-4 h-4 text-muted-foreground hover:text-foreground", isRefreshing && "animate-spin text-primary")} />
        </Button>
        <ThemeToggle />
        <NotificationBell />

        <DropdownMenu>
          <div className="flex items-center gap-1.5 md:gap-3">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-semibold leading-none">{user?.name || user?.email || 'User'}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{role.replace(/_/g, ' ')}</span>
            </div>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost" }), "relative h-8 w-8 md:h-10 md:w-10 rounded-full bg-gradient-to-br from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] p-[2px] transition-transform hover:scale-105 shadow-md")}>
              <div className="h-full w-full rounded-full bg-card flex items-center justify-center">
                <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              </div>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem>Preferences</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

