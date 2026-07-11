'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getCampaignLogs } from '../whatsapp-actions'
import { Badge } from '@/components/ui/badge'

interface CampaignStatsModalProps {
  campaign: any
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CampaignStatsModal({ campaign, open, onOpenChange }: CampaignStatsModalProps) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && campaign) {
      setLoading(true)
      getCampaignLogs(campaign.id).then((data) => {
        setLogs(data)
        setLoading(false)
      })
    }
  }, [open, campaign])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campaign Stats: {campaign?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-4 mb-4">
            <div className="p-4 bg-gray-50 rounded-md border flex-1 text-center">
              <div className="text-2xl font-bold text-gray-900">{campaign?.stats?.total || 0}</div>
              <div className="text-sm text-gray-500">Total Leads</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-md border border-emerald-100 flex-1 text-center">
              <div className="text-2xl font-bold text-emerald-600">{campaign?.stats?.sent || 0}</div>
              <div className="text-sm text-emerald-600">Successfully Sent</div>
            </div>
            <div className="p-4 bg-red-50 rounded-md border border-red-100 flex-1 text-center">
              <div className="text-2xl font-bold text-red-600">{campaign?.stats?.failed || 0}</div>
              <div className="text-sm text-red-600">Failed / Bounced</div>
            </div>
          </div>
          
          <h3 className="font-medium">Delivery Logs</h3>
          {loading ? (
            <div className="text-center py-4">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No logs found.</div>
          ) : (
            <div className="border rounded-md divide-y">
              {logs.map((log) => (
                <div key={log.id} className="p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{log.leads?.name || 'Unknown Lead'}</div>
                    <div className="text-gray-500">{log.phone_number}</div>
                  </div>
                  <div className="flex flex-col sm:items-end gap-1">
                    <Badge variant={log.status === 'SENT' ? 'default' : log.status === 'FAILED' ? 'destructive' : 'secondary'} className={log.status === 'SENT' ? 'bg-emerald-500' : ''}>
                      {log.status}
                    </Badge>
                    {log.error_msg && (
                      <div className="text-xs text-red-500 max-w-[300px] truncate" title={log.error_msg}>
                        {log.error_msg}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
