import { notFound } from 'next/navigation'
import { fetchAPI } from '@/utils/api'
import { cookies } from 'next/headers'
import { PrintButton } from '@/components/sales/print-button'

export default async function ProformaInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  let invoice: any = null
  let settings: any = null
  
  try {
    const resolvedParams = await params;
    console.log(`[ProformaPage] Fetching invoice ${resolvedParams.id}...`);
    const res = await fetchAPI(`/api/sales/invoices/${resolvedParams.id}`, {
      headers: { Cookie: (await cookies()).toString() }
    })
    console.log(`[ProformaPage] API Response success=${res.success}`);
    if (!res.success) {
      console.log(`[ProformaPage] Throwing error because res.success is false or undefined. res =`, res);
      throw new Error("Not found")
    }
    invoice = res.data
    settings = res.settings
  } catch (e) {
    console.error(`[ProformaPage] Caught error:`, e);
    notFound()
  }

  const user = invoice.users || {}
  const plan = invoice.plans || {}
  const companyInfo = settings?.company_info || {}
  const bankDetails = settings?.bank_details || {}
  const invoiceSettings = settings?.invoice_settings || {}
  
  const invoiceDate = new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  
  const amountToWords = (amount: number) => {
    // Very simple conversion for demonstration, a real library would be better for Indian numbering
    return `INR ${amount.toLocaleString('en-IN')} Only`
  }

  return (
    <div className="min-h-screen bg-gray-200 py-10 print:p-0 print:bg-white print:block flex flex-col items-center print:overflow-visible">
      
      <div className="w-full max-w-[900px] mb-4 flex justify-end print:hidden">
        <PrintButton invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .invoice-card {
            max-width: 900px;
            width: 100%;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.05);
            border-top: 8px solid #0f4c81;
            font-family: 'Inter', sans-serif;
            color: #1e293b;
        }
        @media print {
          .invoice-card { box-shadow: none; border-radius: 0; border-top: none; }
          body { background: white; margin: 0; padding: 0; }
        }
        .inv-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 30px 40px 20px;
            border-bottom: 1px solid #e2e8f0;
        }
        .inv-logo-placeholder {
            width: 180px;
            height: 60px;
            background-color: #f0f4f8;
            border: 2px dashed #cbd5e1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #64748b;
            font-size: 13px;
            font-weight: 500;
            border-radius: 6px;
        }
        .inv-document-title h1 {
            margin: 0;
            color: #0f4c81;
            font-size: 24px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .inv-section-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border-bottom: 1px solid #e2e8f0;
        }
        .inv-box {
            padding: 25px 40px;
            border-right: 1px solid #e2e8f0;
        }
        .inv-box:last-child {
            border-right: none;
        }
        .inv-box-title {
            font-size: 12px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 600;
            margin-bottom: 10px;
            letter-spacing: 0.5px;
        }
        .inv-company-name {
            font-size: 16px;
            font-weight: 700;
            color: #0f4c81;
            margin-bottom: 6px;
        }
        .inv-text-sm {
            font-size: 13px;
            line-height: 1.6;
            color: #1e293b;
        }
        .inv-highlight-text {
            font-weight: 600;
            color: #1e293b;
        }
        .inv-meta-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            row-gap: 10px;
            column-gap: 20px;
        }
        .inv-meta-item {
            margin-bottom: 12px;
        }
        .inv-meta-item .inv-label {
            display: block;
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
        }
        .inv-meta-item .inv-value {
            font-size: 13px;
            font-weight: 600;
            color: #1e293b;
        }
        .inv-table-container {
            padding: 0;
        }
        .inv-table {
            width: 100%;
            border-collapse: collapse;
        }
        .inv-table th {
            background-color: #f0f4f8;
            color: #0f4c81;
            text-align: left;
            padding: 14px 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            border-bottom: 1px solid #e2e8f0;
            border-top: 1px solid #e2e8f0;
        }
        .inv-table th:last-child, .inv-table td:last-child {
            text-align: right;
        }
        .inv-table td {
            padding: 16px 20px;
            font-size: 13px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
        }
        .inv-total-row {
            background-color: #f8fafc;
            font-weight: 700;
            font-size: 14px;
        }
        .inv-footer-grid {
            display: grid;
            grid-template-columns: 3fr 2fr;
        }
        .inv-bank-details {
            background: #f8fafc;
            padding: 15px;
            border-radius: 6px;
            margin-top: 15px;
            border: 1px solid #e2e8f0;
        }
        .inv-declaration {
            font-size: 11px;
            color: #64748b;
            margin-top: 15px;
            font-style: italic;
        }
        .inv-signature-box {
            text-align: right;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: flex-end;
        }
        .inv-sig-line {
            width: 200px;
            border-bottom: 1px solid #1e293b;
            margin-bottom: 8px;
        }
        .inv-bottom-bar {
            background: #f0f4f8;
            color: #64748b;
            padding: 12px 40px;
            font-size: 11px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
        }
      `}} />

      <div className="invoice-card">
          <div className="inv-header">
              <div className="inv-logo" style={{ maxWidth: '200px' }}>
                  <img src="/logo.jpeg" alt="Company Logo" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
              </div>
              <div className="inv-document-title">
                  <h1>Proforma Invoice</h1>
              </div>
          </div>

          <div className="inv-section-grid">
              <div className="inv-box">
                  <div className="inv-company-name">{companyInfo.name || 'Company Name'}</div>
                  <div className="inv-text-sm" dangerouslySetInnerHTML={{ __html: (companyInfo.address || '').replace(/\\n/g, '<br>') }} />
                  <div className="inv-text-sm mt-4">
                      GSTIN/UIN: <span className="inv-highlight-text">{companyInfo.gstin}</span><br />
                      State Name: {companyInfo.state_name}, Code: {companyInfo.state_code}
                  </div>
              </div>
              <div className="inv-box">
                  <div className="inv-meta-details">
                      <div className="inv-meta-item">
                          <span className="inv-label">Invoice No.</span>
                          <span className="inv-value">{invoice.invoice_number || invoice.id.substring(0,8).toUpperCase()}</span>
                      </div>
                      <div className="inv-meta-item">
                          <span className="inv-label">Dated</span>
                          <span className="inv-value">{invoiceDate}</span>
                      </div>
                      <div className="inv-meta-item">
                          <span className="inv-label">Terms of Payment</span>
                          <span className="inv-value">Immediate</span>
                      </div>
                      <div className="inv-meta-item">
                          <span className="inv-label">Reference No.</span>
                          <span className="inv-value">{invoice.id.substring(0,8).toUpperCase()}</span>
                      </div>
                  </div>
              </div>
          </div>

          <div className="inv-section-grid">
              <div className="inv-box">
                  <div className="inv-box-title">Consignee (Ship To)</div>
                  <div className="inv-text-sm">
                      <div className="inv-highlight-text" style={{ fontSize: '15px', marginBottom: '4px' }}>{user.name || user.phone}</div>
                      Email: {user.email || 'N/A'}<br />
                      Phone: {user.phone}
                  </div>
              </div>
              <div className="inv-box">
                  <div className="inv-box-title">Buyer (Bill To)</div>
                  <div className="inv-text-sm">
                      <div className="inv-highlight-text" style={{ fontSize: '15px', marginBottom: '4px' }}>{user.name || user.phone}</div>
                      Email: {user.email || 'N/A'}<br />
                      Phone: {user.phone}
                  </div>
              </div>
          </div>

          <div className="inv-table-container">
              <table className="inv-table">
                  <thead>
                      <tr>
                          <th width="5%">Sl No.</th>
                          <th width="45%">Description of Services</th>
                          <th width="10%">HSN/SAC</th>
                          <th width="10%">Quantity</th>
                          <th width="10%">Rate</th>
                          <th width="20%">Amount (INR)</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td>1</td>
                          <td><strong>{plan?.name || 'Premium Health Membership'}</strong></td>
                          <td></td>
                          <td>1</td>
                          <td>{parseFloat(invoice.base_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td>{parseFloat(invoice.base_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                      {parseFloat(invoice.discount_percentage) > 0 && (
                          <tr>
                              <td></td>
                              <td><em>Discount ({invoice.discount_percentage}%)</em></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td style={{ color: '#ef4444' }}>
                                  -{(parseFloat(invoice.base_price) * parseFloat(invoice.discount_percentage) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                          </tr>
                      )}
                      {parseFloat(invoice.gst_percentage || 0) > 0 && (
                          <tr>
                              <td></td>
                              <td><em>Add: GST ({invoice.gst_percentage}%)</em></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td>
                                  {(parseFloat(invoice.gst_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                          </tr>
                      )}
                      <tr className="inv-total-row">
                          <td colSpan={5} style={{ textAlign: 'right' }}>Total</td>
                          <td>₹ {parseFloat(invoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                  </tbody>
              </table>
          </div>

          <div className="inv-section-grid inv-footer-grid">
              <div className="inv-box">
                  <div className="inv-box-title">Amount Chargeable (in words)</div>
                  <div className="inv-text-sm inv-highlight-text" style={{ marginBottom: '20px' }}>
                      {amountToWords(parseFloat(invoice.total_amount))}
                  </div>

                  <div className="inv-bank-details">
                      <div className="inv-box-title" style={{ marginBottom: '8px' }}>Company's Bank Details</div>
                      <div className="inv-text-sm">
                          <table style={{ width: '100%', border: 'none', margin: '0' }}>
                              <tbody>
                                  <tr style={{ border: 'none' }}><td style={{ padding: '4px 0', border: 'none', width: '100px' }}>Bank Name</td><td style={{ padding: '4px 0', border: 'none', fontWeight: '600' }}>: {bankDetails.bank_name}</td></tr>
                                  <tr style={{ border: 'none' }}><td style={{ padding: '4px 0', border: 'none' }}>A/c No.</td><td style={{ padding: '4px 0', border: 'none', fontWeight: '600' }}>: {bankDetails.account_no}</td></tr>
                                  <tr style={{ border: 'none' }}><td style={{ padding: '4px 0', border: 'none' }}>Branch & IFS</td><td style={{ padding: '4px 0', border: 'none', fontWeight: '600' }}>: {bankDetails.branch_ifsc}</td></tr>
                              </tbody>
                          </table>
                      </div>
                  </div>
                  
                  <div className="inv-declaration">
                      <strong>Declaration:</strong> {invoiceSettings.declaration || 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'}
                  </div>
              </div>
              
              <div className="inv-box inv-signature-box">
                  <div className="inv-text-sm" style={{ marginBottom: '50px', textAlign: 'right', width: '100%' }}>
                      <em>E. & O.E</em>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', marginBottom: '40px' }}>for <strong>{companyInfo.name}</strong></div>
                      <div className="inv-sig-line"></div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Authorised Signatory</div>
                  </div>
              </div>
          </div>

          <div className="inv-bottom-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', background: '#f8fafc', borderTop: '2px dashed #cbd5e1' }}>
              <a 
                href={invoice.payment_url || invoice.razorpay_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-10 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105 duration-200 text-lg w-full sm:w-auto print:shadow-none print:transform-none print:transition-none print:scale-100"
                style={{ textDecoration: 'none' }}
              >
                Pay Now
              </a>
              <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
                If the button is not working, click this link: <br/>
                <a href={invoice.razorpay_url} target="_blank" className="font-semibold text-blue-600 hover:underline mt-1 inline-block">{invoice.razorpay_url}</a>
              </div>
          </div>

      </div>
    </div>
  )
}
