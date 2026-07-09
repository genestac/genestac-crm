'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, User, RefreshCw, CheckCircle2 } from 'lucide-react'
import { getDoctorNotifications, markNotificationRead } from '@/app/doctor/actions'
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

export function DoctorHeader() {
  const router = useRouter()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
    fetchNotifications()
    setTimeout(() => {
      setIsRefreshing(false)
    }, 800)
  }

  const [notifications, setNotifications] = useState<any[]>([])
  const unreadCount = notifications.filter(n => !n.is_read).length

  const fetchNotifications = async () => {
    try {
      const data = await getDoctorNotifications()
      setNotifications(data || [])
    } catch (error) {
      console.error("Failed to fetch notifications", error)
    }
  }

  useEffect(() => {
    fetchNotifications()
    // Optional: set an interval to poll
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch (error) {
      console.error("Failed to mark read", error)
    }
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-20 px-8 bg-card/80 backdrop-blur-xl border-b border-border/50 shrink-0 shadow-sm">
      <div className="flex items-center">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-teal-500 to-cyan-500 bg-clip-text text-transparent tracking-tight">Clinical Portal</h2>
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
        
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative rounded-full transition-transform hover:scale-105")}>
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-card animate-pulse"></span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No new notifications</div>
            ) : (
              notifications.map((notif: any) => (
                <div key={notif.id} className={`flex flex-col p-3 border-b last:border-0 ${notif.is_read ? 'opacity-60' : 'bg-muted/30'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-sm">{notif.title}</span>
                    {!notif.is_read && (
                      <button onClick={(e) => { e.preventDefault(); handleMarkRead(notif.id); }} className="text-teal-600 hover:text-teal-700" title="Mark as read">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{notif.message}</p>
                  <span className="text-[10px] text-gray-400">
                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost" }), "relative h-10 w-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 p-[2px] transition-transform hover:scale-105 shadow-md")}>
            <div className="h-full w-full rounded-full bg-card flex items-center justify-center">
              <User className="w-5 h-5 text-teal-600" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Doctor Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem>Availability</DropdownMenuItem>
              <DropdownMenuItem>Notification Preferences</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
