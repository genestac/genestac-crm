'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateGlobalSettings, uploadInvoiceAssets } from './actions'
import { Loader2, UploadCloud, Edit2 } from 'lucide-react'
import Image from 'next/image'

export function InvoiceSettingsForm({ initialSettings }: { initialSettings: any }) {
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  
  const [companyInfo, setCompanyInfo] = useState(initialSettings?.company_info || {
    name: '', address: '', gstin: '', state_name: '', state_code: '', logo_text: '', logo_url: '', signature_url: ''
  })
  
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  
  const [bankDetails, setBankDetails] = useState(initialSettings?.bank_details || {
    bank_name: '', account_no: '', branch_ifsc: ''
  })
  
  const [invoiceSettings, setInvoiceSettings] = useState(initialSettings?.invoice_settings || {
    prefix: '', current_sequence: 1, declaration: ''
  })

  async function handleSave() {
    setLoading(true)
    try {
      // First upload files if any exist
      let updatedCompanyInfo = { ...companyInfo }
      
      if (logoFile || signatureFile) {
        const formData = new FormData()
        if (logoFile) formData.append('logo', logoFile)
        if (signatureFile) formData.append('signature', signatureFile)
        
        const uploadRes = await uploadInvoiceAssets(formData)
        if (uploadRes.success) {
          updatedCompanyInfo = uploadRes.company_info
          setCompanyInfo(updatedCompanyInfo)
        }
      }

      await updateGlobalSettings({
        company_info: updatedCompanyInfo,
        bank_details: bankDetails,
        invoice_settings: invoiceSettings
      })
      alert('Invoice settings saved successfully!')
      setLogoFile(null)
      setSignatureFile(null)
      setIsEditing(false)
    } catch (e: any) {
      alert('Failed to save settings: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    // Reset to initial settings
    setCompanyInfo(initialSettings?.company_info || {
      name: '', address: '', gstin: '', state_name: '', state_code: '', logo_text: '', logo_url: '', signature_url: ''
    })
    setBankDetails(initialSettings?.bank_details || {
      bank_name: '', account_no: '', branch_ifsc: ''
    })
    setInvoiceSettings(initialSettings?.invoice_settings || {
      prefix: '', current_sequence: 1, declaration: ''
    })
    setLogoFile(null)
    setSignatureFile(null)
    setIsEditing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
            <Edit2 className="w-4 h-4" />
            Edit Settings
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Appears on the header and footer of the Proforma Invoice.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Company Name</Label>
            <Input disabled={!isEditing} value={companyInfo.name} onChange={e => setCompanyInfo({...companyInfo, name: e.target.value})} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Address</Label>
            <Input disabled={!isEditing} value={companyInfo.address} onChange={e => setCompanyInfo({...companyInfo, address: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>GSTIN</Label>
            <Input disabled={!isEditing} value={companyInfo.gstin} onChange={e => setCompanyInfo({...companyInfo, gstin: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>State Name</Label>
            <Input disabled={!isEditing} value={companyInfo.state_name} onChange={e => setCompanyInfo({...companyInfo, state_name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>State Code</Label>
            <Input disabled={!isEditing} value={companyInfo.state_code} onChange={e => setCompanyInfo({...companyInfo, state_code: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Logo Text Placeholder</Label>
            <Input disabled={!isEditing} value={companyInfo.logo_text} onChange={e => setCompanyInfo({...companyInfo, logo_text: e.target.value})} />
          </div>
          
          <div className="col-span-2 grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
            <div className="space-y-3">
              <Label>Company Logo (For PDF Header)</Label>
              {companyInfo.logo_url && !logoFile && (
                <div className="w-32 h-16 relative border rounded bg-gray-50 flex items-center justify-center p-2">
                  <Image src={companyInfo.logo_url} alt="Logo" fill className="object-contain" />
                </div>
              )}
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] || null)} className="cursor-pointer" />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Digital Signature (For PDF Footer)</Label>
              {companyInfo.signature_url && !signatureFile && (
                <div className="w-32 h-16 relative border rounded bg-gray-50 flex items-center justify-center p-2">
                  <Image src={companyInfo.signature_url} alt="Signature" fill className="object-contain" />
                </div>
              )}
              {isEditing && (
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={e => setSignatureFile(e.target.files?.[0] || null)} className="cursor-pointer" />
                </div>
              )}
            </div>
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
            <Input disabled={!isEditing} value={bankDetails.bank_name} onChange={e => setBankDetails({...bankDetails, bank_name: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Account No.</Label>
            <Input disabled={!isEditing} value={bankDetails.account_no} onChange={e => setBankDetails({...bankDetails, account_no: e.target.value})} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Branch & IFSC</Label>
            <Input disabled={!isEditing} value={bankDetails.branch_ifsc} onChange={e => setBankDetails({...bankDetails, branch_ifsc: e.target.value})} />
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
            <Input disabled={!isEditing} value={invoiceSettings.prefix} onChange={e => setInvoiceSettings({...invoiceSettings, prefix: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Next Sequence Number</Label>
            <Input disabled={!isEditing} type="number" value={invoiceSettings.current_sequence || ''} onChange={e => setInvoiceSettings({...invoiceSettings, current_sequence: parseInt(e.target.value) || 1})} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Declaration Text</Label>
            <Input disabled={!isEditing} value={invoiceSettings.declaration} onChange={e => setInvoiceSettings({...invoiceSettings, declaration: e.target.value})} />
          </div>
        </CardContent>
      </Card>

      {isEditing && (
        <div className="flex justify-end gap-3">
          <Button onClick={handleCancel} variant="ghost" disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="w-40">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </div>
      )}
    </div>
  )
}
