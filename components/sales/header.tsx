'use client'

import { Bell, User } from 'lucide-react'
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

export function SalesHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-20 px-8 bg-card/80 backdrop-blur-xl border-b border-border/50 shrink-0 shadow-sm">
      <div className="flex items-center">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] bg-clip-text text-transparent tracking-tight">Sales Hub</h2>
      </div>

      <div className="flex items-center space-x-6">
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
              <DropdownMenuLabel>Sales Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile Settings</DropdownMenuItem>
              <DropdownMenuItem>Sales Preferences</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
