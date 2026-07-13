'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { TableData } from '../types'

interface Props {
  data: TableData
  onChange: (data: TableData) => void
}

export function TableBlock({ data, onChange }: Props) {
  const updateHeader = (colIdx: number, value: string) => {
    const headers = [...data.headers]
    headers[colIdx] = value
    onChange({ ...data, headers })
  }

  const updateCell = (rowIdx: number, colIdx: number, value: string) => {
    const rows = [...data.rows]
    rows[rowIdx] = [...rows[rowIdx]]
    rows[rowIdx][colIdx] = value
    onChange({ ...data, rows })
  }

  const addColumn = () => {
    onChange({
      ...data,
      headers: [...data.headers, `Col ${data.headers.length + 1}`],
      rows: data.rows.map(r => [...r, ''])
    })
  }

  const deleteColumn = (colIdx: number) => {
    if (data.headers.length <= 1) return // Keep at least one column
    onChange({
      ...data,
      headers: data.headers.filter((_, i) => i !== colIdx),
      rows: data.rows.map(r => r.filter((_, i) => i !== colIdx))
    })
  }

  const addRow = () => {
    onChange({
      ...data,
      rows: [...data.rows, Array(data.headers.length).fill('')]
    })
  }

  const deleteRow = (rowIdx: number) => {
    if (data.rows.length <= 1) return // Keep at least one row
    onChange({
      ...data,
      rows: data.rows.filter((_, i) => i !== rowIdx)
    })
  }

  return (
    <div className="overflow-x-auto w-full">
      <div className="inline-block min-w-full align-middle border border-border rounded-lg overflow-hidden relative">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/50">
            <tr>
              {data.headers.map((h, i) => (
                <th key={i} className="group/th relative px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <input
                    type="text"
                    value={h}
                    onChange={e => updateHeader(i, e.target.value)}
                    className="w-full bg-transparent outline-none font-bold placeholder:text-muted-foreground/40"
                    placeholder="Header"
                  />
                  {data.headers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteColumn(i)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/th:opacity-100 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </th>
              ))}
              <th className="w-10 px-2 border-l border-border/50">
                <button
                  type="button"
                  onClick={addColumn}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Add Column"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-background divide-y divide-border">
            {data.rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="group/tr">
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className="px-3 py-2 text-sm text-foreground">
                    <input
                      type="text"
                      value={cell}
                      onChange={e => updateCell(rowIdx, colIdx, e.target.value)}
                      className="w-full bg-transparent outline-none placeholder:text-muted-foreground/30"
                      placeholder="Cell content"
                    />
                  </td>
                ))}
                <td className="w-10 px-2 text-center border-l border-border/50">
                  {data.rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteRow(rowIdx)}
                      className="opacity-0 group-hover/tr:opacity-100 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded"
                      title="Delete Row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={data.headers.length + 1} className="px-3 py-2 bg-muted/20">
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
