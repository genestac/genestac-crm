'use client'

import React, { useRef, useCallback, useEffect } from 'react'
import Map, { FullscreenControl } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { setWorkerUrl } from 'maplibre-gl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Users, PhoneCall, Stethoscope, Star } from 'lucide-react'

// Fix Next.js Web Worker MIME type issue by loading from CDN
if (typeof window !== 'undefined') {
  setWorkerUrl('https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl-worker.mjs')
}

interface StatRow {
  state: string
  total: number
  contacted: number
  interested: number
  consultation: number
  qualified: number
}

interface LeadsHeatmapProps {
  geojson: { type: string; features: any[] } | null
  stateStats: StatRow[]
}

function pct(num: number, denom: number) {
  if (!denom) return '0%'
  return `${Math.round((num / denom) * 100)}%`
}

export default function LeadsHeatmap({ geojson, stateStats }: LeadsHeatmapProps) {
  const mapRef = useRef<MapRef>(null)

  const featureCount = geojson?.features?.length ?? 0
  const hasData = featureCount > 0
  const topStates = stateStats.slice(0, 12)
  const maxTotal = topStates[0]?.total || 1

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (map && map.getSource('leads-source')) {
      const source = map.getSource('leads-source') as any
      source.setData(geojson && geojson.features?.length
        ? geojson
        : { type: 'FeatureCollection', features: [] })
    }
  }, [geojson])

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const data = geojson && geojson.features?.length
      ? geojson
      : { type: 'FeatureCollection', features: [] }

    if (!map.getSource('leads-source')) {
      map.addSource('leads-source', { type: 'geojson', data: data as any })
    }

    if (!map.getLayer('leads-heatmap')) {
      map.addLayer({
        id: 'leads-heatmap',
        type: 'heatmap',
        source: 'leads-source',
        maxzoom: 9,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3] as any,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,   'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1,   'rgb(178,24,43)'
          ] as any,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 9, 40] as any,
          'heatmap-opacity': 0.9,
        },
      })
    }

    if (!map.getLayer('leads-circles')) {
      map.addLayer({
        id: 'leads-circles',
        type: 'circle',
        source: 'leads-source',
        minzoom: 0,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 7, 4, 16, 14] as any,
          'circle-color': '#ef4444',
          'circle-opacity': 1,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
  }, [geojson])

  return (
    <Card className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-3xl shadow-sm overflow-hidden mt-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <CardTitle>Lead Geography & State Breakdown</CardTitle>
              <CardDescription>
                Heatmap of incoming leads by location + state-wise conversion funnel.
              </CardDescription>
            </div>
          </div>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-full px-3 py-1">
            {hasData ? `${featureCount} leads mapped` : 'No location data'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 border-t border-gray-100">
        <div className="flex flex-col lg:flex-row h-auto">

          {/* ── Map ── */}
          <div className="flex-1 h-[500px] relative">
            {!hasData && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50/80 pointer-events-none">
                <MapPin className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">No city data available yet</p>
                <p className="text-xs text-gray-400 mt-1">Lead locations appear once city coordinates are cached</p>
              </div>
            )}
            <Map
              ref={mapRef}
              initialViewState={{ longitude: 82.0, latitude: 22.0, zoom: 4.2 }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
              style={{ width: '100%', height: '100%' }}
              onLoad={onMapLoad}
            >
              <FullscreenControl position="top-right" />
            </Map>
          </div>

          {/* ── State Panel ── */}
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-100 overflow-y-auto" style={{ maxHeight: 500 }}>
            {/* Legend row */}
            <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-4 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <span>State</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />Total</span>
                <span className="flex items-center gap-1"><PhoneCall className="w-3 h-3 text-blue-400" />Called</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" />Interest</span>
                <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3 text-emerald-500" />Consult</span>
              </div>
            </div>

            {topStates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <MapPin className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No state data yet</p>
                <p className="text-xs mt-1 text-gray-300">Reload after geocoding completes</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {topStates.map((row, i) => (
                  <li key={row.state} className="px-4 py-3 hover:bg-gray-50/70 transition-colors">
                    {/* Rank + name + bar */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold text-gray-300 w-4 shrink-0">#{i + 1}</span>
                      <span className="text-sm font-semibold text-gray-800 truncate flex-1">{row.state}</span>
                      <span className="text-xs font-bold text-gray-700">{row.total}</span>
                    </div>

                    {/* Progress bar */}
                    <div className="ml-6 mb-2">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-red-400 rounded-full"
                          style={{ width: `${(row.total / maxTotal) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Funnel chips */}
                    <div className="ml-6 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 font-medium">
                        <PhoneCall className="w-2.5 h-2.5" />
                        {pct(row.contacted, row.total)} called
                      </span>
                      {row.interested > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-600 rounded px-1.5 py-0.5 font-medium">
                          <Star className="w-2.5 h-2.5" />
                          {pct(row.interested, row.total)} interested
                        </span>
                      )}
                      {row.consultation > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-50 text-emerald-600 rounded px-1.5 py-0.5 font-medium">
                          <Stethoscope className="w-2.5 h-2.5" />
                          {pct(row.consultation, row.total)} consult
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  )
}
