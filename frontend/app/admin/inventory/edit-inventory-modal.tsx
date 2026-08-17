'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Pencil, Package, Trash2, Plus, UploadCloud, X, Loader2 } from 'lucide-react'
import { updateInventoryItem } from './actions'
import { toast } from 'sonner'

interface VariantRow {
  label: string
  sku: string
  price: string
  compare_at_price: string
  stock_quantity: string
  dosage_strength: string
  weight_or_volume: string
}

const toVariantRow = (v: any): VariantRow => ({
  label: v.label || '',
  sku: v.sku || '',
  price: String(v.price ?? ''),
  compare_at_price: String(v.compare_at_price ?? ''),
  stock_quantity: String(v.stock_quantity ?? 0),
  dosage_strength: v.dosage_strength || '',
  weight_or_volume: v.weight_or_volume || '',
})

const emptyVariant = (): VariantRow => ({
  label: '', sku: '', price: '', compare_at_price: '',
  stock_quantity: '0', dosage_strength: '', weight_or_volume: '',
})

export function EditInventoryModal({ item }: { item: any }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requiresRx, setRequiresRx] = useState(item.requires_prescription ?? false)
  const [isActive, setIsActive] = useState(item.is_active ?? true)
  const [variants, setVariants] = useState<VariantRow[]>(
    (item.variants || []).map(toVariantRow)
  )

  const addVariant = () => setVariants(prev => [...prev, emptyVariant()])
  const removeVariant = (i: number) => setVariants(prev => prev.filter((_, idx) => idx !== i))
  const updateVariant = (i: number, field: keyof VariantRow, val: string) => {
    setVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v))
  }

  // ── Image upload state ──
  const [imageUrl, setImageUrl] = useState(item.image_url || '')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadImage = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/proxy/upload-inventory-image', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setImageUrl(data.url)
      toast.success('Image uploaded!')
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) uploadImage(file)
  }, [uploadImage])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadImage(file)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)

    const tagsRaw = (fd.get('tags') as string || '').trim()
    const conditionsRaw = (fd.get('conditions_symptoms') as string || '').trim()

    const payload: any = {
      name: fd.get('name'),
      description: fd.get('description') || null,
      manufacturer: fd.get('manufacturer') || null,
      category: fd.get('category') || null,
      sku: fd.get('sku') || null,
      slug: fd.get('slug') || null,
      price: Number(fd.get('price')),
      compare_at_price: fd.get('compare_at_price') ? Number(fd.get('compare_at_price')) : null,
      stock_quantity: Number(fd.get('stock_quantity') || 0),
      min_stock_threshold: Number(fd.get('min_stock_threshold') || 10),
      requires_prescription: requiresRx,
      image_url: imageUrl || null,
      expiry_date: fd.get('expiry_date') || null,
      dosage_strength: fd.get('dosage_strength') || null,
      unit: fd.get('unit') || null,
      storage_instructions: fd.get('storage_instructions') || null,
      is_active: isActive,
      tags: tagsRaw ? tagsRaw.split(',').map((t: string) => t.trim()) : [],
      conditions_symptoms: conditionsRaw ? conditionsRaw.split(',').map((c: string) => c.trim()) : [],
    }

    payload.variants = variants
      .filter(v => v.label.trim())
      .map(v => ({
        label: v.label,
        sku: v.sku || null,
        price: Number(v.price),
        compare_at_price: v.compare_at_price ? Number(v.compare_at_price) : null,
        stock_quantity: Number(v.stock_quantity || 0),
        dosage_strength: v.dosage_strength || null,
        weight_or_volume: v.weight_or_volume || null,
      }))

    try {
      await updateInventoryItem(item.id, payload)
      toast.success('Product updated!')
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const conditions = item['Condition/Symptoms']
  const conditionsStr = Array.isArray(conditions) ? conditions.join(', ') : ''
  const tagsStr = Array.isArray(item.tags) ? item.tags.join(', ') : ''

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" onClick={() => setOpen(true)}>
        <Pencil className="w-3.5 h-3.5" /> Edit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[780px] p-0 rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="bg-gradient-to-br from-blue-50 to-white px-6 py-6 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-blue-950 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" /> Edit Inventory Item
              </DialogTitle>
              <DialogDescription className="text-gray-500">
                Update the product details below.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-6 space-y-6">
            {/* ── Basic Info ── */}
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Basic Information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <Label>Name *</Label>
                  <Input name="name" required defaultValue={item.name} />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input name="sku" defaultValue={item.sku || ''} />
                </div>
                <div>
                  <Label>Slug <span className="text-gray-400 font-normal">(URL-friendly, e.g. semaglutide-10mg)</span></Label>
                  <Input name="slug" defaultValue={item.slug || ''} placeholder="auto-generated if blank" />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Textarea name="description" rows={3} defaultValue={item.description || ''} />
                </div>
              </div>
            </div>

            {/* ── Category & Manufacturer ── */}
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Classification</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div>
                  <Label>Category</Label>
                  <Input name="category" defaultValue={item.category || ''} />
                </div>
                <div>
                  <Label>Manufacturer</Label>
                  <Input name="manufacturer" defaultValue={item.manufacturer || ''} />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input name="unit" defaultValue={item.unit || ''} />
                </div>
              </div>
            </div>

            {/* ── Pricing & Stock ── */}
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Pricing & Stock</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div>
                  <Label>Price (₹) *</Label>
                  <Input name="price" type="number" step="0.01" required defaultValue={item.price} />
                </div>
                <div>
                  <Label>Compare at Price</Label>
                  <Input name="compare_at_price" type="number" step="0.01" defaultValue={item.compare_at_price || ''} />
                </div>
                <div>
                  <Label>Stock Qty</Label>
                  <Input name="stock_quantity" type="number" defaultValue={item.stock_quantity ?? 0} />
                </div>
                <div>
                  <Label>Low Stock Alert</Label>
                  <Input name="min_stock_threshold" type="number" defaultValue={item.min_stock_threshold ?? 10} />
                </div>
              </div>
            </div>

            {/* ── Medical Info ── */}
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Medical Details</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <Label>Dosage / Strength</Label>
                  <Input name="dosage_strength" defaultValue={item['Dosage/Strength'] || ''} />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input name="expiry_date" type="date" defaultValue={item.expiry_date || ''} />
                </div>
                <div>
                  <Label>Conditions / Symptoms</Label>
                  <Input name="conditions_symptoms" defaultValue={conditionsStr} />
                </div>
                <div>
                  <Label>Storage Instructions</Label>
                  <Input name="storage_instructions" defaultValue={item.storage_instructions || ''} />
                </div>
              </div>
            </div>

            {/* ── Image & Tags ── */}
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Media & Tags</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                {/* ── Drag & Drop Image Upload ── */}
                <div className="md:col-span-2">
                  <Label>Product Image</Label>
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => !imageUrl && fileInputRef.current?.click()}
                    className={`mt-1 relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl transition-colors cursor-pointer
                      ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/40'}
                      ${imageUrl ? 'h-40' : 'h-32 py-6'}`}
                  >
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2 text-blue-500">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-sm font-medium">Uploading…</span>
                      </div>
                    ) : imageUrl ? (
                      <>
                        <img src={imageUrl} alt="Product" className="h-full w-full object-contain rounded-lg" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setImageUrl('') }}
                          className="absolute top-2 right-2 bg-white border rounded-full p-1 shadow hover:bg-red-50 text-red-500 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                          className="absolute bottom-2 right-2 bg-white border rounded-md px-2 py-1 text-xs text-gray-600 shadow hover:bg-gray-50 transition flex items-center gap-1"
                        >
                          <UploadCloud className="w-3 h-3" /> Change
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400 pointer-events-none">
                        <UploadCloud className="w-7 h-7" />
                        <span className="text-sm font-medium">Drag & drop or <span className="text-blue-500">click to upload</span></span>
                        <span className="text-xs">PNG, JPG, WEBP up to 10MB</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>Tags</Label>
                  <Input name="tags" defaultValue={tagsStr} />
                </div>
              </div>
            </div>

            {/* ── Toggles ── */}
            <div className="flex items-center gap-8 pt-2">
              <div className="flex items-center gap-3">
                <Switch checked={requiresRx} onCheckedChange={setRequiresRx} />
                <Label className="cursor-pointer">Requires Prescription</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label className="cursor-pointer">Active (visible in catalog)</Label>
              </div>
            </div>

            {/* ── Variants ── */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Variants</p>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 cursor-pointer" onClick={addVariant}>
                  <Plus className="w-3.5 h-3.5" /> Add Variant
                </Button>
              </div>

              {variants.length === 0 && (
                <p className="text-sm text-gray-400 italic">No variants — this product is a single SKU.</p>
              )}

              {variants.map((v, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3 bg-gray-50/50 relative group">
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <p className="text-xs font-semibold text-gray-500">Variant {i + 1}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">Label *</Label>
                      <Input value={v.label} onChange={e => updateVariant(i, 'label', e.target.value)} placeholder="e.g. 10mg vial" />
                    </div>
                    <div>
                      <Label className="text-xs">SKU</Label>
                      <Input value={v.sku} onChange={e => updateVariant(i, 'sku', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Price (₹)</Label>
                      <Input value={v.price} onChange={e => updateVariant(i, 'price', e.target.value)} type="number" step="0.01" />
                    </div>
                    <div>
                      <Label className="text-xs">Stock Qty</Label>
                      <Input value={v.stock_quantity} onChange={e => updateVariant(i, 'stock_quantity', e.target.value)} type="number" />
                    </div>
                    <div>
                      <Label className="text-xs">Dosage</Label>
                      <Input value={v.dosage_strength} onChange={e => updateVariant(i, 'dosage_strength', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Weight/Volume</Label>
                      <Input value={v.weight_or_volume} onChange={e => updateVariant(i, 'weight_or_volume', e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Compare at Price</Label>
                      <Input value={v.compare_at_price} onChange={e => updateVariant(i, 'compare_at_price', e.target.value)} type="number" step="0.01" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Submit ── */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="cursor-pointer">Cancel</Button>
              <Button type="submit" disabled={loading} className="gap-2 cursor-pointer">
                {loading ? 'Saving…' : 'Update Item'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
