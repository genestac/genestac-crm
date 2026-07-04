'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, User, RefreshCw } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
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

export function AdminHeader({ role }: { role?: string }) {
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => {
      setIsRefreshing(false)
    }, 800)
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-20 px-8 bg-card/80 backdrop-blur-xl border-b border-border/50 shrink-0 shadow-sm">
      <div className="flex items-center">
        {/* Placeholder for Breadcrumbs or Page Title if dynamic */}
      </div>

      <div className="flex items-center space-x-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh}
          className="text-foreground hover:bg-muted/80 rounded-full transition-transform hover:scale-105"
          title="Refresh Data"
        >
          <RefreshCw className={cn("w-5 h-5 text-muted-foreground hover:text-foreground", isRefreshing && "animate-spin text-primary")} />
        </Button>
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="relative text-foreground hover:bg-muted/80 rounded-full transition-transform hover:scale-105">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-card"></span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75"></span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost" }), "relative h-10 w-10 rounded-full bg-gradient-to-br from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] p-[2px] transition-transform hover:scale-105 shadow-md")}>
            <div className="h-full w-full rounded-full bg-card flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem>Preferences</DropdownMenuItem>
              {(role === 'SUPER_ADMIN' || role === 'admin' || role === 'master_admin') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/sales')}>
                    Switch to Sales Dashboard
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
