'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import { toggleCoupon } from './actions'

export function ToggleCouponButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    setLoading(true)
    try {
      await toggleCoupon(id, !isActive)
    } catch (err: any) {
      alert("Failed to toggle coupon status: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      className="gap-1" 
      onClick={handleToggle}
      disabled={loading}
    >
      {isActive ? (
        <>
          <EyeOff className="w-3 h-3" /> Deactivate
        </>
      ) : (
        <>
          <Eye className="w-3 h-3" /> Activate
        </>
      )}
    </Button>
  )
}
