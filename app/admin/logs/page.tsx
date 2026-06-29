import { createClient } from '@/utils/supabase/server'
import { Activity, UserPlus, Edit3, Trash2, ShieldAlert } from 'lucide-react'

// Helper to format the log event into plain English
function formatLogEvent(log: any) {
  const table = log.entity_table === 'users' ? 'User' : 'Note'
  const targetId = log.entity_id ? log.entity_id.substring(0, 8) : 'Unknown'
  
  if (log.action === 'INSERT') {
    return <span className="text-gray-700">Created a new {table} <span className="font-mono text-xs text-gray-400">({targetId})</span></span>
  }
  
  if (log.action === 'DELETE') {
    return <span className="text-red-700">Deleted a {table} <span className="font-mono text-xs text-red-400">({targetId})</span></span>
  }
  
  if (log.action === 'UPDATE') {
    // Determine what changed
    const changes: string[] = []
    if (log.old_data && log.new_data) {
      Object.keys(log.new_data).forEach(key => {
        // Skip noisy fields that usually update together or aren't user-facing
        if (key === 'updated_at' || key === 'id') return
        
        const oldVal = log.old_data[key]
        const newVal = log.new_data[key]
        
        if (oldVal !== newVal) {
          changes.push(`${key}: "${oldVal || 'empty'}" ➔ "${newVal || 'empty'}"`)
        }
      })
    }
    
    return (
      <div className="flex flex-col gap-1">
        <span className="text-gray-700">Updated {table} <span className="font-mono text-xs text-gray-400">({targetId})</span></span>
        {changes.length > 0 && (
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 p-2 rounded mt-1 font-mono break-all">
            {changes.map((c, i) => <div key={i}>{c}</div>)}
          </div>
        )}
      </div>
    )
  }
  
  return <span className="text-gray-700">{log.action} on {table}</span>
}

function getIcon(action: string) {
  switch (action) {
    case 'INSERT': return <UserPlus className="w-4 h-4 text-emerald-500" />
    case 'UPDATE': return <Edit3 className="w-4 h-4 text-blue-500" />
    case 'DELETE': return <Trash2 className="w-4 h-4 text-red-500" />
    default: return <Activity className="w-4 h-4 text-gray-500" />
  }
}

export default async function AuditLogsPage() {
  const supabase = await createClient()
  
  // Fetch logs using the secure RPC
  const { data: logs, error } = await supabase.rpc('get_audit_logs_with_users')
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time log of all data modifications made by staff members.</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start">
          <ShieldAlert className="w-5 h-5 text-red-500 mr-3 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-medium text-sm">Failed to load logs</h3>
            <p className="text-red-700 text-sm mt-1">{error.message}</p>
          </div>
        </div>
      )}

      {!error && (!logs || logs.length === 0) && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <Activity className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <h3 className="text-gray-900 font-medium">No activity yet</h3>
          <p className="text-gray-500 text-sm mt-1">When users make changes to the system, they will appear here.</p>
        </div>
      )}

      {logs && logs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {logs.map((log: any) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors flex gap-4">
                <div className="mt-1 shrink-0">
                  <div className={`p-2 rounded-full ${
                    log.action === 'INSERT' ? 'bg-emerald-50' : 
                    log.action === 'UPDATE' ? 'bg-blue-50' : 
                    log.action === 'DELETE' ? 'bg-red-50' : 'bg-gray-50'
                  }`}>
                    {getIcon(log.action)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {log.actor_email || 'System / Unknown User'}
                    </p>
                    <time className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </time>
                  </div>
                  <div className="text-sm">
                    {formatLogEvent(log)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
