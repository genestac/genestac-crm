'use client'

import { Columns } from 'lucide-react'
import type { ColumnsData } from '../types'
import { BlockCanvas } from '../BlockCanvas'

interface Props {
  data: ColumnsData
  onChange: (data: ColumnsData) => void
}

const LAYOUTS: { value: ColumnsData['layout']; label: string; cols: number }[] = [
  { value: '50-50',    label: '1/2 - 1/2',     cols: 2 },
  { value: '33-33-33', label: '1/3 - 1/3 - 1/3', cols: 3 },
  { value: '66-33',    label: '2/3 - 1/3',     cols: 2 },
  { value: '33-66',    label: '1/3 - 2/3',     cols: 2 },
]

export function ColumnsBlock({ data, onChange }: Props) {
  const getGridClass = (layout: ColumnsData['layout']) => {
    switch (layout) {
      case '50-50':    return 'grid-cols-1 md:grid-cols-2'
      case '33-33-33': return 'grid-cols-1 md:grid-cols-3'
      case '66-33':    return 'grid-cols-1 md:grid-cols-[2fr_1fr]'
      case '33-66':    return 'grid-cols-1 md:grid-cols-[1fr_2fr]'
    }
  }

  const changeLayout = (newLayout: ColumnsData['layout']) => {
    const layoutMeta = LAYOUTS.find(l => l.value === newLayout)!
    const newColsCount = layoutMeta.cols
    const newColumns = [...data.columns]
    
    // Add missing columns if expanding
    while (newColumns.length < newColsCount) {
      newColumns.push([])
    }
    // Note: If shrinking, we *could* merge blocks, but for simplicity we'll just slice them.
    // In a production app, you might want to warn the user if they're losing blocks.
    if (newColumns.length > newColsCount) {
      newColumns.length = newColsCount
    }

    onChange({ layout: newLayout, columns: newColumns })
  }

  return (
    <div className="space-y-4">
      {/* Layout Picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Columns className="w-3.5 h-3.5" />
          Column Layout:
        </span>
        {LAYOUTS.map(layout => (
          <button
            key={layout.value}
            type="button"
            onClick={() => changeLayout(layout.value)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              data.layout === layout.value
                ? 'bg-violet-600 text-white border-violet-600 font-medium'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {layout.label}
          </button>
        ))}
      </div>

      {/* Columns Grid */}
      <div className={`grid gap-4 bg-muted/20 p-2 rounded-2xl border border-dashed border-border ${getGridClass(data.layout)}`}>
        {data.columns.map((colBlocks, idx) => (
          <div key={idx} className="bg-background rounded-xl p-2 min-h-[150px] shadow-sm border border-border/50 min-w-0">
            <BlockCanvas
              blocks={colBlocks}
              onChange={(newBlocks) => {
                const newColumns = [...data.columns]
                newColumns[idx] = newBlocks
                onChange({ ...data, columns: newColumns })
              }}
              disableColumns={true} // Prevent infinite nesting
            />
          </div>
        ))}
      </div>
    </div>
  )
}
