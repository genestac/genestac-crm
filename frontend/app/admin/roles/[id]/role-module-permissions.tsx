'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { togglePermission } from '../actions'

interface Permission {
  id: string
  action: string
  description: string
  module: string
}

interface ModuleGroup {
  name: string
  permissions: Permission[]
}

export function RoleModulePermissions({
  roleId,
  modules,
  initialActiveIds
}: {
  roleId: string
  modules: ModuleGroup[]
  initialActiveIds: string[]
}) {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set(initialActiveIds))
  const [loading, setLoading] = useState<string | null>(null)

  const handleToggle = async (permissionId: string, isCurrentlyGranted: boolean) => {
    setLoading(permissionId)
    try {
      await togglePermission(roleId, permissionId, !isCurrentlyGranted)
      
      const newIds = new Set(activeIds)
      if (isCurrentlyGranted) {
        newIds.delete(permissionId)
      } else {
        newIds.add(permissionId)
      }
      setActiveIds(newIds)
    } catch (error: any) {
      alert("Error: " + error.message)
    } finally {
      setLoading(null)
    }
  }

  // Helper to extract the base action (e.g. "Patients:create" -> "create")
  const getActionName = (action: string) => {
    if (action.includes(':')) return action.split(':')[1]
    return action
  }

  return (
    <div className="space-y-6">
      {modules.map((module) => {
        // Find specific CRUD permissions
        const createPerm = module.permissions.find(p => getActionName(p.action).toLowerCase() === 'create')
        const readPerm = module.permissions.find(p => getActionName(p.action).toLowerCase() === 'read')
        const updatePerm = module.permissions.find(p => getActionName(p.action).toLowerCase() === 'update')
        const deletePerm = module.permissions.find(p => getActionName(p.action).toLowerCase() === 'delete')
        
        // Any other custom actions
        const customPerms = module.permissions.filter(p => 
          !['create', 'read', 'update', 'delete'].includes(getActionName(p.action).toLowerCase())
        )

        return (
          <div key={module.name} className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-lg text-gray-800">{module.name} Module</h3>
            </div>
            <div className="p-6">
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* CREATE */}
                {createPerm && (
                  <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${activeIds.has(createPerm.id) ? 'bg-green-50 border-green-200' : 'hover:bg-gray-50'}`}>
                    <Checkbox 
                      checked={activeIds.has(createPerm.id)} 
                      disabled={loading === createPerm.id}
                      onCheckedChange={() => handleToggle(createPerm.id, activeIds.has(createPerm.id))}
                    />
                    <div className="font-medium text-sm text-gray-900">Create</div>
                  </label>
                )}

                {/* READ */}
                {readPerm && (
                  <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${activeIds.has(readPerm.id) ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}>
                    <Checkbox 
                      checked={activeIds.has(readPerm.id)} 
                      disabled={loading === readPerm.id}
                      onCheckedChange={() => handleToggle(readPerm.id, activeIds.has(readPerm.id))}
                    />
                    <div className="font-medium text-sm text-gray-900">Read</div>
                  </label>
                )}

                {/* UPDATE */}
                {updatePerm && (
                  <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${activeIds.has(updatePerm.id) ? 'bg-yellow-50 border-yellow-200' : 'hover:bg-gray-50'}`}>
                    <Checkbox 
                      checked={activeIds.has(updatePerm.id)} 
                      disabled={loading === updatePerm.id}
                      onCheckedChange={() => handleToggle(updatePerm.id, activeIds.has(updatePerm.id))}
                    />
                    <div className="font-medium text-sm text-gray-900">Update</div>
                  </label>
                )}

                {/* DELETE */}
                {deletePerm && (
                  <label className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${activeIds.has(deletePerm.id) ? 'bg-red-50 border-red-200' : 'hover:bg-gray-50'}`}>
                    <Checkbox 
                      checked={activeIds.has(deletePerm.id)} 
                      disabled={loading === deletePerm.id}
                      onCheckedChange={() => handleToggle(deletePerm.id, activeIds.has(deletePerm.id))}
                    />
                    <div className="font-medium text-sm text-gray-900">Delete</div>
                  </label>
                )}
              </div>

              {/* Render custom actions if any */}
              {customPerms.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">Custom Actions</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {customPerms.map(p => (
                      <label key={p.id} className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${activeIds.has(p.id) ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-gray-50'}`}>
                        <Checkbox 
                          checked={activeIds.has(p.id)} 
                          disabled={loading === p.id}
                          onCheckedChange={() => handleToggle(p.id, activeIds.has(p.id))}
                        />
                        <div className="font-medium text-sm text-gray-900 capitalize">{getActionName(p.action)}</div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )
      })}

      {modules.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed">
          <p className="text-gray-500">No modules or permissions have been created yet.</p>
        </div>
      )}
    </div>
  )
}
