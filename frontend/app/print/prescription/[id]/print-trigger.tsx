'use client'

import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'

export default function PrintTrigger() {
  const [showPreview, setShowPreview] = useState(false)
  const [htmlContent, setHtmlContent] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      generateHTML()
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const generateHTML = () => {
    // Get prescription data from the DOM
    const patientName = document.querySelector('p.text-lg.font-bold')?.textContent || 'Unknown Patient'
    const date = document.querySelectorAll('p.text-lg.font-bold')[1]?.textContent || new Date().toLocaleDateString()
    const doctorName = document.querySelector('h2.text-xl.font-bold')?.textContent || 'Dr. Smith'
    const medications = Array.from(document.querySelectorAll('h3.text-xl.font-bold')).map(el => el.textContent)
    const dosages = Array.from(document.querySelectorAll('p.text-sm.text-gray-600.mt-1.font-medium')).map(el => el.textContent)
    const durations = Array.from(document.querySelectorAll('p.font-semibold')).map(el => el.textContent)
    const frequencies = Array.from(document.querySelectorAll('span.font-semibold')).map(el => el.textContent)
    const instructions = document.querySelector('p.whitespace-pre-wrap')?.textContent || ''

    // Create HTML template
    const content = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GENESTAC Online Prescription</title>
<style>
    body {
        font-family: Arial, sans-serif;
        background-color: #e5e7eb;
        margin: 0;
        padding: 40px 20px;
        color: #1e293b;
    }

    .prescription-card {
        max-width: 950px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.05);
        overflow: hidden;
        border-top: 8px solid #0f4c81;
    }

    .header {
        display: flex;
        justify-content: space-between;
        padding: 30px 40px;
        border-bottom: 1px solid #e2e8f0;
        background-color: #ffffff;
    }

    .brand-area {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .brand-logo {
        width: 120px;
        height: 120px;
        object-fit: contain;
    }

    .brand-info h1 {
        margin: 0;
        color: #0f4c81;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: -0.5px;
    }

    .brand-info .tagline {
        font-size: 13px;
        color: #64748b;
        font-weight: 500;
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .program-badge {
        display: inline-block;
        background: #f0f4f8;
        color: #0f4c81;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        margin-top: 10px;
    }

    .contact-area {
        text-align: right;
        font-size: 12px;
        line-height: 1.6;
        color: #64748b;
    }
    .contact-area strong {
        color: #1e293b;
    }

    .info-section {
        padding: 0 40px;
    }

    .meta-bar {
        display: flex;
        justify-content: space-between;
        background: #f0f4f8;
        padding: 12px 40px;
        font-size: 13px;
        color: #0f4c81;
        font-weight: 500;
        border-bottom: 1px solid #e2e8f0;
    }

    .people-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 30px;
        margin: 30px 0;
    }

    .person-card {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 20px;
        position: relative;
    }
    
    .person-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: #0f4c81;
        border-radius: 12px 0 0 12px;
    }

    .person-card.patient::before {
        background: #059669;
    }

    .card-title {
        font-size: 12px;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 600;
        margin-bottom: 12px;
        letter-spacing: 0.5px;
    }

    .doc-name {
        font-size: 20px;
        font-weight: 700;
        color: #0f4c81;
        margin: 0 0 4px 0;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        margin-bottom: 8px;
    }
    .detail-row:last-child {
        margin-bottom: 0;
    }
    .detail-row .label {
        color: #64748b;
    }
    .detail-row .value {
        font-weight: 600;
        color: #1e293b;
        text-align: right;
    }

    .clinical-section {
        padding: 0 40px 30px;
    }

    .section-heading {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 16px;
        font-weight: 700;
        color: #0f4c81;
        margin-bottom: 16px;
        border-bottom: 2px solid #f0f4f8;
        padding-bottom: 8px;
    }
    
    .rx-symbol {
        font-size: 24px;
        font-weight: bold;
        color: #0f4c81;
        margin-right: 5px;
    }

    .diagnosis-box {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 15px;
        font-size: 14px;
        color: #1e293b;
        margin-bottom: 30px;
    }

    table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        overflow: hidden;
    }
    
    th {
        background-color: #f8fafc;
        color: #64748b;
        text-align: left;
        padding: 14px 16px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid #e2e8f0;
    }

    td {
        padding: 16px;
        font-size: 14px;
        border-bottom: 1px solid #e2e8f0;
        vertical-align: top;
    }

    tr:last-child td {
        border-bottom: none;
    }

    .med-name {
        font-weight: 700;
        color: #1e293b;
        font-size: 15px;
        display: block;
        margin-bottom: 4px;
    }
    
    .med-type {
        font-size: 12px;
        color: #64748b;
        background: #f8fafc;
        padding: 2px 8px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
    }

    .footer-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 30px;
        padding: 30px 40px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
    }

    .advice-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .advice-list li {
        font-size: 13px;
        color: #1e293b;
        margin-bottom: 10px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }

    .advice-list li::before {
        content: '•';
        color: #0f4c81;
        font-size: 18px;
        line-height: 1;
    }

    .signature-box {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
    }

    .verified-badge {
        background: #ecfdf5;
        color: #059669;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 20px;
        border: 1px solid #a7f3d0;
    }

    .sig-line {
        width: 100%;
        border-bottom: 1px solid #1e293b;
        margin-bottom: 8px;
    }

    .bottom-bar {
        background: #0f4c81;
        color: rgba(255,255,255,0.9);
        padding: 15px 40px;
        font-size: 12px;
        text-align: center;
    }
</style>
</head>
<body>

<div class="prescription-card">
    
    <!-- Header -->
    <div class="header">
        <div class="brand-area">
            <img src="/logo.jpeg" alt="GENESTAC Logo" class="brand-logo" />
            <div class="brand-info">
                <h1>GENESTAC</h1>
                <div class="tagline">THERAPEUTICS LLP</div>
                <div class="program-badge">Doctor-Guided Medical Weight Loss Program</div>
            </div>
        </div>
        <div class="contact-area">
            <strong>106, A Block, Unitech Business Zone,</strong><br>
            Nirvana Country, Gurgaon – 122018<br>
            &#9742; +91 98765 43210 / 9971114121<br>
            &#9993; info@genestac.com<br>
            &#127760; www.genestac.com
        </div>
    </div>

    <!-- Meta Bar -->
    <div class="meta-bar">
        <div><strong>Date:</strong> ${date}</div>
        <div><strong>Order ID:</strong> GST-${Date.now().toString().slice(-6)}</div>
        <div><strong>Consultation:</strong> Online</div>
    </div>

    <!-- Doctor & Patient Info -->
    <div class="info-section">
        <div class="people-grid">
            <!-- Doctor Card -->
            <div class="person-card">
                <div class="card-title">Consulting Physician</div>
                <h2 class="doc-name">${doctorName}</h2>
                <div class="detail-row">
                    <span class="label">Qualifications</span>
                    <span class="value">MBBS, MD</span>
                </div>
                <div class="detail-row">
                    <span class="label">Medical Reg. No.</span>
                    <span class="value">193489</span>
                </div>
                <div class="detail-row">
                    <span class="label">Provider</span>
                    <span class="value">GENESTAC THERAPEUTICS</span>
                </div>
            </div>

            <!-- Patient Card -->
            <div class="person-card patient">
                <div class="card-title">Patient Details</div>
                <div class="detail-row">
                    <span class="label">Patient Name</span>
                    <span class="value">${patientName}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Patient ID</span>
                    <span class="value">PT-${Date.now().toString().slice(-6)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Age / Gender</span>
                    <span class="value">-- / --</span>
                </div>
                <div class="detail-row">
                    <span class="label">Contact</span>
                    <span class="value">--</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Clinical Data & Rx -->
    <div class="clinical-section">
        <div class="section-heading">Diagnosis & Assessment</div>
        <div class="diagnosis-box">
            ${instructions || 'General consultation and prescription'}
        </div>

        <div class="section-heading">
            <span class="rx-symbol">&#8471;</span> Prescription Plan
        </div>
        <table>
            <thead>
                <tr>
                    <th>Medicine Name</th>
                    <th>Dosage</th>
                    <th>Frequency</th>
                    <th>Duration</th>
                    <th>Instructions</th>
                </tr>
            </thead>
            <tbody>
                ${medications.map((med, i) => `
                <tr>
                    <td>
                        <span class="med-name">${med}</span>
                        <span class="med-type">Medication</span>
                    </td>
                    <td>${dosages[i] || '--'}</td>
                    <td>${frequencies[i] || '--'}</td>
                    <td>${durations[i] || '--'}</td>
                    <td>As directed</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <!-- Footer / Signatures -->
    <div class="footer-grid">
        <div>
            <div class="section-heading" style="font-size: 14px; border:none; margin-bottom: 10px; padding: 0;">Doctor's Advice & Instructions</div>
            <ul class="advice-list">
                <li>Maintain a balanced, calorie-deficit diet as discussed.</li>
                <li>Ensure adequate hydration (at least 2.5 - 3 liters of water daily).</li>
                <li>Incorporate 30 minutes of light to moderate exercise 5 days a week.</li>
                <li>Follow up immediately if you experience any severe side effects.</li>
            </ul>
            
            <div style="margin-top: 20px; font-size: 13px;">
                <strong>Next Follow-up:</strong> Review after 4 Weeks or earlier if required.
            </div>
        </div>

        <div class="signature-box">
            <div class="verified-badge">&#10004; Verified e-Prescription</div>
            <div class="sig-line"></div>
            <div style="font-size: 14px; font-weight: 700; color: var(--primary);">${doctorName}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Signature / Authorization</div>
        </div>
    </div>

    <!-- Bottom Bar -->
    <div class="bottom-bar">
        &#128274; This prescription is confidential and intended solely for the patient named above. Generated by GENESTAC THERAPEUTICS LLP.
    </div>

</div>

</body>
</html>
    `
    setHtmlContent(content)
    setShowPreview(true)
  }

  const downloadPDF = async () => {
    try {
      // Dynamically import pdfmake only on client side
      const pdfMake = (await import('pdfmake/build/pdfmake')).default as any
      const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default as any
      pdfMake.vfs = pdfFonts.pdfMake.vfs

      // Get prescription data from the DOM
      const patientName = document.querySelector('p.text-lg.font-bold')?.textContent || 'Unknown Patient'
      const date = document.querySelectorAll('p.text-lg.font-bold')[1]?.textContent || new Date().toLocaleDateString()
      const doctorName = document.querySelector('h2.text-xl.font-bold')?.textContent || 'Dr. Smith'
      const medications = Array.from(document.querySelectorAll('h3.text-xl.font-bold')).map(el => el.textContent)
      const dosages = Array.from(document.querySelectorAll('p.text-sm.text-gray-600.mt-1.font-medium')).map(el => el.textContent)
      const durations = Array.from(document.querySelectorAll('p.font-semibold')).map(el => el.textContent)
      const frequencies = Array.from(document.querySelectorAll('span.font-semibold')).map(el => el.textContent)
      const instructions = document.querySelector('p.whitespace-pre-wrap')?.textContent || ''

      const docDefinition = {
        content: [
          // Header
          {
            columns: [
              {
                stack: [
                  { text: 'GENESTAC', fontSize: 26, bold: true, color: '#0f4c81', margin: [0, 0, 0, 5] },
                  { text: 'THERAPEUTICS LLP', fontSize: 13, color: '#64748b', margin: [0, 0, 0, 5] },
                  { text: 'Doctor-Guided Medical Weight Loss Program', fontSize: 10, color: '#0f4c81', background: '#f0f4f8', margin: [0, 5, 0, 0] }
                ],
                width: '60%'
              },
              {
                stack: [
                  { text: '106, A Block, Unitech Business Zone,', fontSize: 10, color: '#64748b', alignment: 'right' },
                  { text: 'Nirvana Country, Gurgaon – 122018', fontSize: 10, color: '#64748b', alignment: 'right' },
                  { text: '+91 98765 43210 / 9971114121', fontSize: 10, color: '#64748b', alignment: 'right' },
                  { text: 'info@genestac.com', fontSize: 10, color: '#64748b', alignment: 'right' },
                  { text: 'www.genestac.com', fontSize: 10, color: '#64748b', alignment: 'right' }
                ],
                width: '40%'
              }
            ],
            margin: [0, 0, 0, 10]
          },
          // Meta bar
          {
            canvas: [
              { type: 'rect', x: 0, y: 0, w: 515, h: 30, color: '#f0f4f8' }
            ],
            margin: [0, 10, 0, 0]
          },
          {
            columns: [
              { text: `Date: ${date}`, fontSize: 11, color: '#0f4c81', bold: true },
              { text: `Order ID: GST-${Date.now().toString().slice(-6)}`, fontSize: 11, color: '#0f4c81', bold: true },
              { text: 'Consultation: Online', fontSize: 11, color: '#0f4c81', bold: true }
            ],
            margin: [20, -25, 0, 20]
          },
          // Doctor & Patient Info
          {
            columns: [
              {
                stack: [
                  { text: 'Consulting Physician', fontSize: 10, color: '#64748b', bold: true, margin: [0, 0, 0, 10] },
                  { text: doctorName, fontSize: 18, bold: true, color: '#0f4c81', margin: [0, 0, 0, 5] },
                  { text: 'Qualifications: MBBS, MD', fontSize: 11, margin: [0, 0, 0, 3] },
                  { text: 'Medical Reg. No.: 193489', fontSize: 11, margin: [0, 0, 0, 3] },
                  { text: 'Provider: GENESTAC THERAPEUTICS', fontSize: 11, margin: [0, 0, 0, 3] }
                ],
                width: '48%',
                margin: [0, 0, 10, 0],
                border: [true, true, true, true],
                borderColor: '#e2e8f0',
                padding: 15
              },
              {
                stack: [
                  { text: 'Patient Details', fontSize: 10, color: '#64748b', bold: true, margin: [0, 0, 0, 10] },
                  { text: `Patient Name: ${patientName}`, fontSize: 11, margin: [0, 0, 0, 3] },
                  { text: `Patient ID: PT-${Date.now().toString().slice(-6)}`, fontSize: 11, margin: [0, 0, 0, 3] },
                  { text: 'Age / Gender: -- / --', fontSize: 11, margin: [0, 0, 0, 3] },
                  { text: 'Contact: --', fontSize: 11, margin: [0, 0, 0, 3] }
                ],
                width: '48%',
                border: [true, true, true, true],
                borderColor: '#e2e8f0',
                padding: 15
              }
            ],
            margin: [0, 20, 0, 20]
          },
          // Diagnosis
          { text: 'Diagnosis & Assessment', fontSize: 14, bold: true, color: '#0f4c81', margin: [0, 0, 0, 10], decoration: 'underline' },
          {
            text: instructions || 'General consultation and prescription',
            fontSize: 12,
            background: '#f8fafc',
            padding: 10,
            margin: [0, 0, 0, 20]
          },
          // Prescription
          { text: '℞ Prescription Plan', fontSize: 14, bold: true, color: '#0f4c81', margin: [0, 0, 0, 10], decoration: 'underline' },
          {
            table: {
              headerRows: 1,
              widths: ['*', '*', '*', '*', '*'],
              body: [
                [
                  { text: 'Medicine Name', bold: true, fontSize: 10, color: '#64748b', fillColor: '#f8fafc' },
                  { text: 'Dosage', bold: true, fontSize: 10, color: '#64748b', fillColor: '#f8fafc' },
                  { text: 'Frequency', bold: true, fontSize: 10, color: '#64748b', fillColor: '#f8fafc' },
                  { text: 'Duration', bold: true, fontSize: 10, color: '#64748b', fillColor: '#f8fafc' },
                  { text: 'Instructions', bold: true, fontSize: 10, color: '#64748b', fillColor: '#f8fafc' }
                ],
                ...medications.map((med, i) => [
                  { text: med, bold: true, fontSize: 11 },
                  { text: dosages[i] || '--', fontSize: 11 },
                  { text: frequencies[i] || '--', fontSize: 11 },
                  { text: durations[i] || '--', fontSize: 11 },
                  { text: 'As directed', fontSize: 11 }
                ])
              ]
            },
            margin: [0, 0, 0, 20]
          },
          // Footer
          {
            columns: [
              {
                stack: [
                  { text: "Doctor's Advice & Instructions", fontSize: 12, bold: true, color: '#0f4c81', margin: [0, 0, 0, 10] },
                  { text: '• Maintain a balanced, calorie-deficit diet as discussed.', fontSize: 10, margin: [0, 0, 0, 5] },
                  { text: '• Ensure adequate hydration (at least 2.5 - 3 liters of water daily).', fontSize: 10, margin: [0, 0, 0, 5] },
                  { text: '• Incorporate 30 minutes of light to moderate exercise 5 days a week.', fontSize: 10, margin: [0, 0, 0, 5] },
                  { text: '• Follow up immediately if you experience any severe side effects.', fontSize: 10, margin: [0, 0, 0, 5] },
                  { text: 'Next Follow-up: Review after 4 Weeks or earlier if required.', fontSize: 11, bold: true, margin: [20, 10, 0, 0] }
                ],
                width: '65%'
              },
              {
                stack: [
                  { text: '✓ Verified e-Prescription', fontSize: 9, color: '#059669', background: '#ecfdf5', margin: [0, 0, 0, 20] },
                  { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 1 }], margin: [0, 0, 0, 5] },
                  { text: doctorName, fontSize: 12, bold: true, color: '#0f4c81' },
                  { text: 'Signature / Authorization', fontSize: 9, color: '#64748b' }
                ],
                width: '30%',
                alignment: 'center'
              }
            ],
            margin: [0, 20, 0, 20],
            background: '#f8fafc',
            padding: 20
          },
          // Bottom bar
          {
            canvas: [
              { type: 'rect', x: 0, y: 0, w: 515, h: 30, color: '#0f4c81' }
            ],
            margin: [0, 0, 0, 0]
          },
          {
            text: '🔒 This prescription is confidential and intended solely for the patient named above. Generated by GENESTAC THERAPEUTICS LLP.',
            fontSize: 9,
            color: 'white',
            alignment: 'center',
            margin: [0, -25, 0, 0]
          }
        ],
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40]
      }

      pdfMake.createPdf(docDefinition as any).download(`prescription-${Date.now()}.pdf`)
      
      // Close the window after download
      window.close()
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Error generating PDF. Please try again.')
    }
  }

  if (!showPreview) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-2xl">
          <h2 className="text-lg font-bold text-gray-900">Prescription Preview</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadPDF}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={() => window.close()}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Preview Content */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
          <div 
            id="preview-container"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}
          />
        </div>
      </div>
    </div>
  )
}
