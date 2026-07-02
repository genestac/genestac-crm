'use client'

import { useState, useTransition } from 'react'
import { updateUserRole } from './actions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface RoleDropdownProps {
  userId: string
  currentRole: string
  isMasterAdmin: boolean
}

const ALL_ROLES = [
  'superadmin',
  'master_admin',
  'admin',
  'manager',
  'doctor',
  'sales',
  'inventory_manager',
  'support',
  'customer'
]

export function RoleDropdown({ userId, currentRole, isMasterAdmin }: RoleDropdownProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleRoleChange = (newRole: string | null) => {
    if (!newRole) return
    setError(null)
    startTransition(async () => {
      try {
        await updateUserRole(userId, newRole)
      } catch (err: any) {
        setError(err.message || 'Failed to update role')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={currentRole}
        onValueChange={handleRoleChange}
        disabled={isPending}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          {ALL_ROLES.map((role) => {
            const isElevatedRole = role === 'admin' || role === 'master_admin' || role === 'superadmin'
            const isDisabled = isElevatedRole && !isMasterAdmin

            return (
              <SelectItem key={role} value={role} disabled={isDisabled}>
                {role.replace('_', ' ').toUpperCase()}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
