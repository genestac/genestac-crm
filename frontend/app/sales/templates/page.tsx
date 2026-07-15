'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, MessageSquare, PhoneCall, FileBox, Plus, Variable } from 'lucide-react'

export default function TemplatesPage() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const tabQuery = searchParams.get('tab')
  const activeTab = tabQuery || 'COMMUNICATION'
  
  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    title: '',
    category: 'COMMUNICATION',
    type: 'WHATSAPP',
    content: ''
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (res.ok && Array.isArray(data)) {
        setTemplates(data)
      } else {
        console.error('Failed to fetch templates:', data.error || 'Invalid response')
        setTemplates([])
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTemplate)
      })
      setIsModalOpen(false)
      fetchTemplates()
    } catch (error) {
      console.error('Failed to create template:', error)
    }
  }

  const insertPlaceholder = (placeholder: string) => {
    setNewTemplate(prev => ({
      ...prev,
      content: prev.content + `{{${placeholder}}}`
    }))
  }

  const tabs = [
    { id: 'COMMUNICATION', label: 'Automated Responses', icon: MessageSquare, description: 'Pre-approved WhatsApp, SMS, and Email messages' },
    { id: 'DOCUMENT', label: 'Financial & Documents', icon: FileText, description: 'Invoices, proposals, and dynamic quotes' },
    { id: 'SCRIPT', label: 'Call Scripts', icon: PhoneCall, description: 'Pitch scripts, qualification checklists' },
    { id: 'COLLATERAL', label: 'Marketing Collateral', icon: FileBox, description: 'Approved digital business cards and posters' },
  ]

  const filteredTemplates = templates.filter(t => t.category === activeTab)

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Templates Library</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Central repository for standardized, reusable sales assets to eliminate repetitive manual entry and enforce strict consistency.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-brand-teal hover:bg-brand-ocean text-white">
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8 mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <div 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                isActive 
                  ? 'bg-blue-50/50 border-blue-500 shadow-sm ring-1 ring-blue-500' 
                  : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className={`font-semibold ${isActive ? 'text-blue-900' : 'text-gray-900'}`}>{tab.label}</h3>
              </div>
              <p className="text-xs text-gray-500 line-clamp-2">{tab.description}</p>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-teal"></div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No templates found</h3>
            <p className="text-gray-500 mt-1 max-w-sm">
              Get started by creating your first {tabs.find(t => t.id === activeTab)?.label.toLowerCase()} template.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredTemplates.map(template => (
              <div key={template.id} className="border rounded-lg overflow-hidden flex flex-col">
                <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-gray-900">{template.title}</h4>
                    <span className="text-xs font-medium px-2 py-1 bg-gray-200 text-gray-700 rounded-full mt-2 inline-block">
                      {template.type}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-white flex-1 text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {template.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Create New Template</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Template Title</label>
                  <input 
                    type="text" 
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-teal outline-none"
                    placeholder="e.g. Welcome Message"
                    value={newTemplate.title}
                    onChange={e => setNewTemplate({...newTemplate, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Category</label>
                  <select 
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-teal outline-none"
                    value={newTemplate.category}
                    onChange={e => setNewTemplate({...newTemplate, category: e.target.value})}
                  >
                    <option value="COMMUNICATION">Automated Responses</option>
                    <option value="DOCUMENT">Financial & Documents</option>
                    <option value="SCRIPT">Call Scripts</option>
                    <option value="COLLATERAL">Marketing Collateral</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Type</label>
                <select 
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-teal outline-none"
                  value={newTemplate.type}
                  onChange={e => setNewTemplate({...newTemplate, type: e.target.value})}
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="INVOICE">Invoice</option>
                  <option value="PITCH">Pitch Script</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-sm font-medium text-gray-700">Content</label>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => insertPlaceholder('lead.full_name')} className="px-2 py-1 bg-blue-50 text-blue-600 rounded flex items-center hover:bg-blue-100">
                      <Variable className="w-3 h-3 mr-1"/> Name
                    </button>
                    <button onClick={() => insertPlaceholder('appointment.date')} className="px-2 py-1 bg-blue-50 text-blue-600 rounded flex items-center hover:bg-blue-100">
                      <Variable className="w-3 h-3 mr-1"/> Date
                    </button>
                  </div>
                </div>
                <textarea 
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-teal outline-none min-h-[150px] font-mono"
                  placeholder="Hi {{lead.full_name}}, your appointment is confirmed..."
                  value={newTemplate.content}
                  onChange={e => setNewTemplate({...newTemplate, content: e.target.value})}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} className="bg-brand-teal text-white hover:bg-brand-ocean">Save Template</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
