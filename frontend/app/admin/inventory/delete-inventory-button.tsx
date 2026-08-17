'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { deleteInventoryItem } from './actions'

export function DeleteInventoryButton({ id, name }: { id: string; name: string }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return
    }
    
    setLoading(true)
    try {
      await deleteInventoryItem(id)
    } catch (err: any) {
      alert("Failed to delete item: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      className="gap-1.5 cursor-pointer"
      onClick={handleDelete}
      disabled={loading}
    >
      <Trash2 className="w-3.5 h-3.5" /> {loading ? 'Deleting…' : 'Delete'}
    </Button>
  )
}
