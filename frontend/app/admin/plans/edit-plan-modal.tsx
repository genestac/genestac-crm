'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, PlusCircle, Tag, Clock, Banknote, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { updatePlan } from './actions'
import { Badge } from '@/components/ui/badge'

export function EditPlanModal({ plan }: { plan: any }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Local state for features and boolean flags
  const [features, setFeatures] = useState<string[]>(plan.features?.length > 0 ? plan.features : [''])
  const [isFeatured, setIsFeatured] = useState(!!plan.is_featured)
  const [isEntryLevel, setIsEntryLevel] = useState(!!plan.is_entry_level)
  const [variants, setVariants] = useState<any[]>(
    plan.plan_variants?.length > 0 
      ? plan.plan_variants.map((v: any) => ({ ...v, _showDiscount: !!v.discounted_price }))
      : [{ duration_label: '1 Month', duration_days: 30, base_price: plan.price || '', _showDiscount: false }]
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    
    const formData = new FormData(e.currentTarget)
    
    const payload = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      cart_name: (formData.get('cart_name') as string) || null,
      cta: (formData.get('cta') as string) || null,
      note: (formData.get('note') as string) || null,
      features: features.filter(f => f.trim() !== ''),
      is_featured: isFeatured,
      is_entry_level: isEntryLevel,
      variants: variants.map(v => {
        const { _showDiscount, ...rest } = v;
        return {
          ...rest,
          base_price: Number(rest.base_price),
          discounted_price: rest.discounted_price ? Number(rest.discounted_price) : null
        }
      })
    }

    try {
      await updatePlan(plan.id, payload)
      setOpen(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFeatureChange = (index: number, val: string) => {
    const updated = [...features]
    updated[index] = val
    setFeatures(updated)
  }

  const updateVariant = (index: number, field: string, value: any) => {
    const updated = [...variants]
    updated[index] = { ...updated[index], [field]: value }
    setVariants(updated)
  }

  const addVariant = () => {
    setVariants([...variants, { duration_label: '', duration_days: 30, base_price: '', _showDiscount: false }])
  }

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index))
  }

  const clearDiscount = (index: number) => {
    const updated = [...variants];
    updated[index] = {
      ...updated[index],
      _showDiscount: false,
      discounted_price: null,
      discount_text: null,
      discount_end_date: null
    };
    setVariants(updated);
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <Pencil className="w-3 h-3" /> Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[1200px] w-[95vw] max-h-[90vh] flex flex-col p-0 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-50 to-white px-6 py-6 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-indigo-950 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600" /> Edit Medical Plan
              </DialogTitle>
              <DialogDescription className="text-indigo-900/60 mt-1">
                Configure your plan's details, marketing copy, and pricing variants.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto flex-1 p-6">
            <form id={`edit-plan-form-${plan.id}`} onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: General Info */}
              <div className="lg:col-span-5 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">General Details</h3>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Plan Name *</Label>
                    <Input name="name" required defaultValue={plan.name} className="bg-gray-50/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Description</Label>
                    <Textarea name="description" defaultValue={plan.description || ''} className="bg-gray-50/50 min-h-[100px]" />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Marketing & Display</h3>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Cart Name</Label>
                    <Input name="cart_name" defaultValue={plan.cart_name || ''} className="bg-gray-50/50" placeholder="e.g. Premium Access" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-700">CTA Text</Label>
                      <Input name="cta" defaultValue={plan.cta || ''} className="bg-gray-50/50" placeholder="e.g. Subscribe Now" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700">Note</Label>
                      <Input name="note" defaultValue={plan.note || ''} className="bg-gray-50/50" placeholder="e.g. Best Value!" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Features & Highlights</h3>
                  
                  <div className="flex flex-col gap-3 mb-4 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                    <div className="flex items-center space-x-3">
                      <Checkbox id={`edit-featured-${plan.id}`} checked={isFeatured} onCheckedChange={(c) => setIsFeatured(c as boolean)} className="data-[state=checked]:bg-indigo-600" />
                      <Label htmlFor={`edit-featured-${plan.id}`} className="font-medium flex items-center gap-1.5 cursor-pointer">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> Highlight as Featured
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox id={`edit-entry-${plan.id}`} checked={isEntryLevel} onCheckedChange={(c) => setIsEntryLevel(c as boolean)} className="data-[state=checked]:bg-indigo-600" />
                      <Label htmlFor={`edit-entry-${plan.id}`} className="font-medium flex items-center gap-1.5 cursor-pointer">
                        <Tag className="w-4 h-4 text-blue-500" /> Entry Level Plan
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-gray-700">Plan Features</Label>
                    {features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 group">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" />
                        <Input 
                          value={f} 
                          onChange={e => handleFeatureChange(i, e.target.value)} 
                          placeholder="e.g. 24/7 Support"
                          className="bg-gray-50/50 h-9"
                        />
                        {features.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 hover:bg-red-50" onClick={() => setFeatures(features.filter((_, idx) => idx !== i))}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-full mt-2 border-dashed text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" onClick={() => setFeatures([...features, ''])}>
                      <PlusCircle className="w-4 h-4 mr-2" /> Add Feature
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Column: Variants */}
              <div className="lg:col-span-7 bg-gray-50/50 rounded-xl border p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Banknote className="w-5 h-5 text-emerald-600" /> Pricing & Durations
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Configure all duration variants for this plan.</p>
                  </div>
                  <Button type="button" size="sm" onClick={addVariant} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                    <PlusCircle className="w-4 h-4 mr-2" /> Add Variant
                  </Button>
                </div>
                
                <div className="space-y-5">
                  {variants.map((v, i) => (
                    <Card key={i} className="border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md relative group">
                      <CardHeader className="bg-white px-5 py-3 border-b flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100">Variant {i + 1}</Badge>
                          {v.duration_label || 'New Variant'}
                        </CardTitle>
                        {variants.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeVariant(i)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent className="p-5 bg-white/50 space-y-5">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-gray-400" /> Label *
                            </Label>
                            <Input value={v.duration_label} onChange={e => updateVariant(i, 'duration_label', e.target.value)} required placeholder="e.g. 1 Month" className="h-9" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-gray-400" /> Exact Days *
                            </Label>
                            <Input type="number" value={v.duration_days} onChange={e => updateVariant(i, 'duration_days', Number(e.target.value))} required placeholder="30" className="h-9" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                              <Banknote className="w-3.5 h-3.5 text-gray-400" /> Base Price *
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-sans">₹</span>
                              <Input type="number" step="any" value={v.base_price} onChange={e => updateVariant(i, 'base_price', e.target.value)} required className="pl-7 h-9" />
                            </div>
                          </div>
                        </div>

                        {/* Discount Section */}
                        {v._showDiscount ? (
                          <div className="bg-amber-50/50 rounded-lg p-4 border border-amber-200/60 relative">
                            <div className="absolute -top-2.5 left-4 bg-amber-100 px-2 rounded-full border border-amber-200">
                              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Discount Active</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-amber-800">Discount Price</Label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-sans">₹</span>
                                  <Input type="number" step="any" value={v.discounted_price || ''} onChange={e => updateVariant(i, 'discounted_price', e.target.value)} className="pl-7 h-9 bg-white border-amber-200 focus-visible:ring-amber-500" />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-amber-800">Promo Tagline</Label>
                                <Input value={v.discount_text || ''} onChange={e => updateVariant(i, 'discount_text', e.target.value)} placeholder="e.g. Diwali Offer" className="h-9 bg-white border-amber-200 focus-visible:ring-amber-500" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-amber-800">Ends On</Label>
                                <Input type="date" value={v.discount_end_date ? v.discount_end_date.split('T')[0] : ''} onChange={e => updateVariant(i, 'discount_end_date', e.target.value ? new Date(e.target.value).toISOString() : null)} className="h-9 bg-white border-amber-200 focus-visible:ring-amber-500" />
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <Button type="button" variant="ghost" size="sm" onClick={() => clearDiscount(i)} className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="w-3 h-3 mr-1.5" /> Remove Discount
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => updateVariant(i, '_showDiscount', true)} className="w-full border-dashed text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200">
                              <Tag className="w-3.5 h-3.5 mr-2" /> Add Promotional Discount
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
            </form>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="px-6">Cancel</Button>
            <Button type="submit" form={`edit-plan-form-${plan.id}`} disabled={loading} className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
