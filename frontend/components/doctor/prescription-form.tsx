'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { getInventory, writePrescription } from '@/app/doctor/actions'
import { Plus, Trash2, Loader2, Pill, CalendarDays, ClipboardList, Stethoscope } from 'lucide-react'

export function PrescriptionForm({ patientId, onPrescriptionAdded }: { patientId: string, onPrescriptionAdded: () => void }) {
  const [loading, setLoading] = useState(false)
  const [inventory, setInventory] = useState<any[]>([])
  
  const [instructions, setInstructions] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    getInventory().then(data => setInventory(data || []))
  }, [])

  const addItem = () => {
    setItems([...items, { inventoryId: '', dosage: '', frequency: '', durationDays: 30, quantity: 1, beforeLunch: false, afterLunch: false, time: '' }])
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const handleItemChange = (idx: number, field: string, val: any) => {
    const newItems = [...items]
    newItems[idx] = { ...newItems[idx], [field]: val }
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await writePrescription({
        patientId,
        instructions,
        validUntil,
        items
      })
      alert("Prescription added successfully")
      onPrescriptionAdded()
      setInstructions('')
      setValidUntil('')
      setItems([])
    } catch (err: any) {
      alert("Error writing prescription: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-full bg-white rounded-2xl border overflow-hidden flex flex-col shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-800 to-teal-900 px-8 py-6 text-white shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Digital Prescription</h2>
            <p className="text-teal-100 text-sm mt-1">Formulate a secure, compliant treatment plan.</p>
          </div>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col md:flex-row overflow-hidden relative pb-[80px]">
        {/* Left Column: Details */}
        <div className="md:w-1/3 bg-white/80 border-r p-8 overflow-y-auto shrink-0 flex flex-col gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-teal-900 font-semibold border-b pb-2">
              <CalendarDays className="w-4 h-4 text-teal-600" />
              <h3>Validity</h3>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Valid Until</label>
              <Input type="date" required value={validUntil} onChange={e => setValidUntil(e.target.value)} className="h-12 bg-gray-50/50 rounded-xl" />
            </div>
          </div>

          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-2 text-teal-900 font-semibold border-b pb-2">
              <ClipboardList className="w-4 h-4 text-teal-600" />
              <h3>Patient Instructions</h3>
            </div>
            <div className="space-y-2 h-full flex flex-col">
              <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">General Notes</label>
              <Textarea 
                placeholder="e.g. Take after meals, stay hydrated..." 
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                className="resize-none flex-1 min-h-[200px] bg-gray-50/50 rounded-xl p-4"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Medications */}
        <div className="md:w-2/3 p-8 overflow-y-auto bg-gray-50/30 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Medications List</h3>
              <p className="text-sm text-gray-500">Add products from your clinic's inventory.</p>
            </div>
            <Button type="button" onClick={addItem} className="bg-white text-teal-700 hover:bg-teal-50 border border-teal-200 shadow-sm gap-2 h-10 px-5 rounded-full font-bold">
              <Plus className="w-4 h-4" /> Add Item
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-teal-100 rounded-3xl bg-white/40">
              <div className="w-20 h-20 bg-teal-50 rounded-full flex items-center justify-center mb-4">
                <Pill className="w-8 h-8 text-teal-300" />
              </div>
              <h4 className="text-lg font-bold text-gray-700">No Medications Prescribed</h4>
              <p className="text-sm text-gray-500 max-w-sm mt-2">Click the "Add Item" button above to start building the patient's treatment plan.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, idx) => (
                <div key={idx} className="group bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] overflow-hidden transition-all hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] hover:border-teal-100">
                  <div className="bg-gray-50/80 px-6 py-4 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-gray-700">Medication Entry</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full h-8 w-8 transition-colors opacity-0 group-hover:opacity-100" onClick={() => removeItem(idx)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="p-6 grid grid-cols-12 gap-6 items-end">
                    <div className="col-span-12 space-y-2">
                      <label className="text-[11px] uppercase text-gray-500 font-bold tracking-widest">Select Product</label>
                      <Select required value={item.inventoryId} onValueChange={v => handleItemChange(idx, 'inventoryId', v)}>
                        <SelectTrigger className="h-12 bg-white rounded-xl border-gray-200 hover:border-teal-300 transition-colors">
                          <SelectValue placeholder="Search inventory..." />
                        </SelectTrigger>
                        <SelectContent>
                          {inventory.map(inv => (
                            <SelectItem key={inv.id} value={inv.id}>{inv.name} {inv.sku ? `— ${inv.sku}` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="col-span-6 md:col-span-3 space-y-2">
                      <label className="text-[11px] uppercase text-gray-500 font-bold tracking-widest">Dosage</label>
                      <Input required placeholder="e.g. 500mg" value={item.dosage} onChange={e => handleItemChange(idx, 'dosage', e.target.value)} className="h-12 bg-gray-50/50 rounded-xl" />
                    </div>
                    
                    <div className="col-span-6 md:col-span-3 space-y-2">
                      <label className="text-[11px] uppercase text-gray-500 font-bold tracking-widest">Frequency</label>
                      <Input required placeholder="e.g. 1x Day" value={item.frequency} onChange={e => handleItemChange(idx, 'frequency', e.target.value)} className="h-12 bg-gray-50/50 rounded-xl" />
                    </div>
                    
                    <div className="col-span-6 md:col-span-3 space-y-2">
                      <label className="text-[11px] uppercase text-gray-500 font-bold tracking-widest">Duration (Days)</label>
                      <Input required type="number" min="1" value={item.durationDays} onChange={e => handleItemChange(idx, 'durationDays', e.target.value)} className="h-12 bg-gray-50/50 rounded-xl" />
                    </div>
                    
                    <div className="col-span-6 md:col-span-3 space-y-2">
                      <label className="text-[11px] uppercase text-gray-500 font-bold tracking-widest">Total Qty</label>
                      <Input required type="number" min="1" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', e.target.value)} className="h-12 bg-gray-50/50 rounded-xl" />
                    </div>

                    <div className="col-span-12 border-t pt-4 mt-2"></div>

                    <div className="col-span-4 md:col-span-4 space-y-2">
                      <label className="text-[11px] uppercase text-gray-500 font-bold tracking-widest">Time (Optional)</label>
                      <Input type="time" value={item.time} onChange={e => handleItemChange(idx, 'time', e.target.value)} className="h-12 bg-gray-50/50 rounded-xl" />
                    </div>

                    <div className="col-span-4 md:col-span-4 flex items-center space-x-3 h-12">
                      <Checkbox id={`before-lunch-${idx}`} checked={item.beforeLunch} onCheckedChange={(checked) => handleItemChange(idx, 'beforeLunch', checked)} />
                      <label htmlFor={`before-lunch-${idx}`} className="text-sm font-semibold text-gray-700 cursor-pointer">Before Lunch</label>
                    </div>

                    <div className="col-span-4 md:col-span-4 flex items-center space-x-3 h-12">
                      <Checkbox id={`after-lunch-${idx}`} checked={item.afterLunch} onCheckedChange={(checked) => handleItemChange(idx, 'afterLunch', checked)} />
                      <label htmlFor={`after-lunch-${idx}`} className="text-sm font-semibold text-gray-700 cursor-pointer">After Lunch</label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t px-8 py-4 flex justify-end gap-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <Button type="button" variant="ghost" onClick={() => {}} className="px-6 rounded-full font-semibold hover:bg-gray-100">
            Clear Form
          </Button>
          <Button type="submit" disabled={loading || items.length === 0} className="px-8 rounded-full font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-600/20 transition-all hover:-translate-y-0.5">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Issue Prescription
          </Button>
        </div>
      </form>
    </div>
  )
}
