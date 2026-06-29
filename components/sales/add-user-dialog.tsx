'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button, buttonVariants } from '@/components/ui/button'
import { createLead } from '@/app/sales/actions'
import { createClient } from '@/utils/supabase/client'
import { MapPin, UserPlus } from 'lucide-react'

export function AddUserDialog() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [plans, setPlans] = useState<any[]>([])
  const [sources, setSources] = useState<any[]>([])
  const [addressOpen, setAddressOpen] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (open) {
      supabase.from('plans').select('*').eq('is_active', true).then(({data}) => setPlans(data || []))
      supabase.from('user_sources').select('*').eq('is_active', true).then(({data}) => setSources(data || []))
    }
  }, [open, supabase])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    
    try {
      await createLead(formData)
      setOpen(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants()}>
        <UserPlus className="w-4 h-4 mr-2" /> Add New User
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create New User</DialogTitle>
          <DialogDescription>
            Manually enter a new prospective patient into the CRM.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm border border-red-200">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" name="name" placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
              <Input id="phone" name="phone" required placeholder="+91 9876543210" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" name="email" type="email" placeholder="john@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source_id">User Source</Label>
              <Select key={`source-${sources.length}`} name="source_id">
                <SelectTrigger>
                  <SelectValue placeholder="Select Source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interested_plan_id">Interested Plan</Label>
              <Select key={`plan-${plans.length}`} name="interested_plan_id">
                <SelectTrigger>
                  <SelectValue placeholder="Select Plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (₹{p.price})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority Level</Label>
            <Select name="priority" defaultValue="MEDIUM">
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">High (Hot)</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Collapsible Address Section */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <button 
              type="button" 
              onClick={() => setAddressOpen(!addressOpen)}
              className="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <h3 className="font-semibold text-gray-800 text-sm">Add Address Details (Optional)</h3>
              </div>
              <span className="text-gray-400">{addressOpen ? '▼' : '▶'}</span>
            </button>
            
            {addressOpen && (
              <div className="p-4 grid grid-cols-2 gap-4 border-t">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="street_address">Street Address</Label>
                  <Input id="street_address" name="street_address" placeholder="123 Main St, Apt 4B" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" placeholder="Mumbai" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" name="state" placeholder="Maharashtra" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Postal / Zip Code</Label>
                  <Input id="postal_code" name="postal_code" placeholder="400001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" name="country" defaultValue="India" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="followup_notes">Initial Notes</Label>
            <Textarea 
              id="followup_notes" 
              name="followup_notes" 
              placeholder="Record any details to help with the first contact..." 
              className="resize-none h-24"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t mt-4">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              variant="outline"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]" 
              disabled={loading}
            >
              {loading ? "Creating..." : "Save User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
