'use client'

import { useState, useEffect } from 'react'
import { getCustomFields, createCustomField, deleteCustomField } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Plus, Loader2 } from 'lucide-react'

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  useEffect(() => {
    loadFields()
  }, [])
  
  const loadFields = async () => {
    setLoading(true)
    try {
      const data = await getCustomFields()
      setFields(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    const formData = new FormData(e.currentTarget)
    
    // Auto-generate name from label if not provided
    if (!formData.get('name')) {
      const label = formData.get('label') as string
      formData.set('name', label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''))
    }
    
    try {
      await createCustomField(formData)
      e.currentTarget.reset()
      await loadFields()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this custom field? Existing data will remain in metadata but won't be editable through the UI.")) return
    
    try {
      await deleteCustomField(id)
      await loadFields()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Custom Fields</h1>
        <p className="text-gray-500 mt-1">Manage dynamic fields for Users and Leads profiles.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <div className="bg-card border rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Add New Field</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Select name="entity_type" defaultValue="user">
                  <SelectTrigger>
                    <SelectValue placeholder="Select Entity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Registered User</SelectItem>
                    <SelectItem value="lead">Website Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Field Label</Label>
                <Input name="label" placeholder="e.g. Weight (kg)" required />
              </div>
              
              <div className="space-y-2">
                <Label>Technical Name (Optional)</Label>
                <Input name="name" placeholder="e.g. weight_kg" />
                <p className="text-[10px] text-gray-500">Auto-generated if left blank. Used as JSON key.</p>
              </div>
              
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select name="type" defaultValue="text">
                  <SelectTrigger>
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text / String</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="boolean">Yes / No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button type="submit" className="w-full mt-4" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Add Field
              </Button>
            </form>
          </div>
        </div>
        
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">Entity</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Label</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Name (Key)</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500">Loading fields...</td></tr>
                ) : fields.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500">No custom fields created yet.</td></tr>
                ) : fields.map(field => (
                  <tr key={field.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 uppercase text-xs font-semibold tracking-wider text-primary">{field.entity_type}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{field.label}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{field.name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{field.type}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(field.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
