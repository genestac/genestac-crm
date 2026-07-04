'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateGlobalSettings } from './actions'
import { Loader2 } from 'lucide-react'

export function InvoiceSettingsForm({ initialSettings }: { initialSettings: any }) {
  const [loading, setLoading] = useState(false)
  
  const [companyInfo, setCompanyInfo] = useState(initialSettings?.company_info || {
    name: '', address: '', gstin: '', state_name: '', state_code: '', logo_text: ''
  })
  
  const [bankDetails, setBankDetails] = useState(initialSettings?.bank_details || {
    bank_name: '', account_no: '', branch_ifsc: ''
  })
  
  const [invoiceSettings, setInvoiceSettings] = useState(initialSettings?.invoice_settings || {
    prefix: '', current_sequence: 1, declaration: ''
  })

  async function handleSave() {
    setLoading(true)
    try {
      await updateGlobalSettings({
        company_info: companyInfo,
        bank_details: bankDetails,
        invoice_settings: invoiceSettings
      })
      alert('Invoice settings saved successfully!')
    } catch (e: any) {
      alert('Failed to save settings: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Appears on the header and footer of the Proforma Invoice.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Company Name</Label>
            <Input value={companyInfo.name} onChange={e => setCompanyInfo({...companyInfo, name: e.target.value})} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Address</Label>
            <Input value={companyInfo.address} onChange={e => setCompanyInfo({...companyInfo, address: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>GSTIN</Label>
            <Input value={companyInfo.gstin} onChange={e => setCompanyInfo({...companyInfo, gstin: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>State Name</Label>
            <Input value={companyInfo.state_name} onChange={e => setCompanyInfo({...companyInfo, state_name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>State Code</Label>
            <Input value={companyInfo.state_code} onChange={e => setCompanyInfo({...companyInfo, state_code: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Logo Text Placeholder</Label>
            <Input value={companyInfo.logo_text} onChange={e => setCompanyInfo({...companyInfo, logo_text: e.target.value})} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
          <CardDescription>Displayed for customer payment reference.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input value={bankDetails.bank_name} onChange={e => setBankDetails({...bankDetails, bank_name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Account No.</Label>
            <Input value={bankDetails.account_no} onChange={e => setBankDetails({...bankDetails, account_no: e.target.value})} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Branch & IFSC</Label>
            <Input value={bankDetails.branch_ifsc} onChange={e => setBankDetails({...bankDetails, branch_ifsc: e.target.value})} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Sequence & Formatting</CardTitle>
          <CardDescription>Manage PI numbering prefixes and current sequence.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Invoice Prefix (e.g. Gen/26-27/)</Label>
            <Input value={invoiceSettings.prefix} onChange={e => setInvoiceSettings({...invoiceSettings, prefix: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Next Sequence Number</Label>
            <Input type="number" value={invoiceSettings.current_sequence || ''} onChange={e => setInvoiceSettings({...invoiceSettings, current_sequence: parseInt(e.target.value) || 1})} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Declaration Text</Label>
            <Input value={invoiceSettings.declaration} onChange={e => setInvoiceSettings({...invoiceSettings, declaration: e.target.value})} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading} className="w-40">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Settings
        </Button>
      </div>
    </div>
  )
}
