'use client'

import { useState, useMemo, Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AddInventoryModal } from './add-inventory-modal'
import { EditInventoryModal } from './edit-inventory-modal'
import { DeleteInventoryButton } from './delete-inventory-button'
import {
  Search,
  Package,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react'

export function InventoryClient({ items }: { items: any[] }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low' | 'out'>('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Derive unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>()
    items.forEach(i => { if (i.category) cats.add(i.category) })
    return Array.from(cats).sort()
  }, [items])

  // Filter
  const filtered = useMemo(() => {
    let list = [...items]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.sku?.toLowerCase().includes(q) ||
        i.manufacturer?.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'all') {
      list = list.filter(i => i.category === categoryFilter)
    }
    if (stockFilter === 'in_stock') {
      list = list.filter(i => i.stock_quantity > (i.min_stock_threshold ?? 10))
    } else if (stockFilter === 'low') {
      list = list.filter(i => i.stock_quantity > 0 && i.stock_quantity <= (i.min_stock_threshold ?? 10))
    } else if (stockFilter === 'out') {
      list = list.filter(i => i.stock_quantity <= 0)
    }
    return list
  }, [items, search, categoryFilter, stockFilter])

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Summary counts
  const totalItems = items.length
  const lowStock = items.filter(i => i.stock_quantity > 0 && i.stock_quantity <= (i.min_stock_threshold ?? 10)).length
  const outOfStock = items.filter(i => i.stock_quantity <= 0).length

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: totalItems, color: 'text-gray-900', bg: 'bg-white' },
          { label: 'In Stock', value: totalItems - lowStock - outOfStock, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Low Stock', value: lowStock, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Out of Stock', value: outOfStock, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl border p-4 shadow-sm`}>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Search & Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name, SKU, manufacturer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value as typeof stockFilter)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All Stock</option>
          <option value="in_stock">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>

        <span className="text-xs text-gray-500 font-semibold ml-auto">
          {filtered.length} of {totalItems} items
        </span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3.5 font-medium text-gray-900 w-8"></th>
                  <th className="px-4 py-3.5 font-medium text-gray-900">Product</th>
                  <th className="px-4 py-3.5 font-medium text-gray-900">SKU</th>
                  <th className="px-4 py-3.5 font-medium text-gray-900">Category</th>
                  <th className="px-4 py-3.5 font-medium text-gray-900 text-right">Price</th>
                  <th className="px-4 py-3.5 font-medium text-gray-900 text-center">Stock</th>
                  <th className="px-4 py-3.5 font-medium text-gray-900 text-center">Status</th>
                  <th className="px-4 py-3.5 font-medium text-gray-900 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => {
                  const hasVariants = item.variants && item.variants.length > 0
                  const isExpanded = expandedRows.has(item.id)
                  const isLow = item.stock_quantity > 0 && item.stock_quantity <= (item.min_stock_threshold ?? 10)
                  const isOut = item.stock_quantity <= 0

                  return (
                    <Fragment key={item.id}> 
                      <tr className="hover:bg-gray-50/50 transition-colors">
                        {/* Expand toggle */}
                        <td className="px-4 py-3">
                          {hasVariants ? (
                            <button onClick={() => toggleExpand(item.id)} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          ) : <span className="w-4 h-4 block" />}
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.image_url ? (
                              <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center border">
                                <ImageIcon className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-gray-900 max-w-[200px] truncate">{item.name}</div>
                              <div className="text-xs text-gray-500 truncate max-w-[200px]">{item.manufacturer || '—'}</div>
                            </div>
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{item.sku || '—'}</span>
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3">
                          {item.category ? (
                            <Badge variant="outline" className="font-medium">{item.category}</Badge>
                          ) : <span className="text-gray-400">—</span>}
                        </td>

                        {/* Price */}
                        <td className="px-4 py-3 text-right">
                          <div className="font-bold text-gray-900">₹{item.price}</div>
                          {item.compare_at_price && item.compare_at_price > item.price && (
                            <div className="text-xs text-gray-400 line-through">₹{item.compare_at_price}</div>
                          )}
                        </td>

                        {/* Stock */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                            <span className={`font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                              {item.stock_quantity}
                            </span>
                          </div>
                          {hasVariants && (
                            <span className="text-[10px] text-gray-400 font-medium">{item.variants.length} variant{item.variants.length > 1 ? 's' : ''}</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {isOut ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">Out of Stock</Badge>
                            ) : isLow ? (
                              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">Low Stock</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">In Stock</Badge>
                            )}
                            {item.requires_prescription && (
                              <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600">Rx</Badge>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <EditInventoryModal item={item} />
                            <DeleteInventoryButton id={item.id} name={item.name} />
                          </div>
                        </td>
                      </tr>

                      {/* Expanded variants row */}
                      {hasVariants && isExpanded && (
                        <tr key={`${item.id}-variants`}>
                          <td colSpan={8} className="bg-gray-50/70 px-8 py-3 border-t border-dashed border-gray-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Variants</p>
                            <div className="grid gap-2">
                              {item.variants.map((v: any, vi: number) => (
                                <div key={vi} className="flex items-center justify-between bg-white border rounded-lg px-4 py-2.5 text-sm">
                                  <div className="flex items-center gap-4">
                                    <span className="font-semibold text-gray-800">{v.label}</span>
                                    {v.sku && <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{v.sku}</span>}
                                    {v.dosage_strength && <span className="text-xs text-gray-500">{v.dosage_strength}</span>}
                                    {v.weight_or_volume && <span className="text-xs text-gray-500">{v.weight_or_volume}</span>}
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <div className="text-right">
                                      <span className="font-bold">₹{v.price}</span>
                                      {v.compare_at_price && v.compare_at_price > v.price && (
                                        <span className="text-xs text-gray-400 line-through ml-2">₹{v.compare_at_price}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {v.stock_quantity <= 0 && <AlertTriangle className="w-3 h-3 text-red-500" />}
                                      <span className={`font-semibold ${v.stock_quantity <= 0 ? 'text-red-600' : 'text-gray-700'}`}>
                                        {v.stock_quantity} in stock
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Package className="w-6 h-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No inventory items found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm">
              {search || categoryFilter !== 'all' || stockFilter !== 'all'
                ? 'Try adjusting your filters to see more results.'
                : 'Get started by adding your first product to the inventory.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
