'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Trash } from 'lucide-react'
import { deleteCoupon } from './actions'

export function DeleteCouponButton({ id, code }: { id: string; code: string }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the coupon code "${code}"?`)) {
      return
    }
    
    setLoading(false)
    try {
      setLoading(true)
      await deleteCoupon(id)
    } catch (err: any) {
      alert("Failed to delete coupon: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button 
      variant="destructive" 
      size="sm" 
      className="gap-1" 
      onClick={handleDelete}
      disabled={loading}
    >
      <Trash className="w-3 h-3" /> {loading ? 'Deleting...' : 'Delete'}
    </Button>
  )
}
