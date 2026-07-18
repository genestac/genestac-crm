import { getPrescriptionById } from '@/app/doctor/actions'
import { notFound } from 'next/navigation'
import PrintTrigger from './print-trigger'

export default async function PrintPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let rx: any
  try {
    rx = await getPrescriptionById(id)
  } catch (err) {
    console.error(err)
  }

  if (!rx) notFound()

  const rxDate = new Date(rx.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const rxIdShort = rx.id.substring(0, 8).toUpperCase()
  const patient  = rx.patients  || {}
  const doctor   = rx.doctors   || {}
  const items    = rx.prescription_items || []

  return (
    <div className="min-h-screen bg-gray-200 py-10 print:p-0 print:bg-white flex flex-col items-center">

      {/* Pass real data to the download button */}
      <PrintTrigger rx={rx} />

      {/* ─── Prescription Card ─────────────────────────────────────── */}
      <div className="w-full max-w-[900px] bg-white rounded-2xl shadow-xl border-t-8 border-[#0f4c81] overflow-hidden print:max-w-full print:rounded-none print:shadow-none">

        {/* ── HEADER ── */}
        <div className="flex justify-between items-center px-10 py-7 border-b border-slate-200">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpeg" alt="Genestac Logo" className="w-24 h-24 object-contain" />
            <div>
              <h1 className="text-[26px] font-black text-[#0f4c81] tracking-tight leading-none">GENESTAC</h1>
              <p className="text-sm text-slate-500 uppercase tracking-widest font-medium mt-0.5">THERAPEUTICS LLP</p>
              <span className="inline-block mt-2 bg-[#f0f4f8] text-[#0f4c81] text-xs font-semibold px-3 py-1 rounded-full">
                Doctor-Guided Medical Weight Loss Program
              </span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500 leading-6">
            <strong className="text-slate-700 block">106, A Block, Unitech Business Zone,</strong>
            Nirvana Country, Gurgaon – 122018<br />
            ✆ +91 9971114121<br />
            ✉ info@genestac.com<br />
            ⊕ www.genestac.com
          </div>
        </div>

        {/* ── META BAR ── */}
        <div className="flex justify-between items-center px-10 py-3 bg-[#f0f4f8] border-b border-slate-200 text-[#0f4c81] text-sm font-semibold">
          <span><strong>Date:</strong> {rxDate}</span>
          <span><strong>Prescription ID:</strong> {rxIdShort}</span>
          <span><strong>Consultation:</strong> Online</span>
        </div>

        {/* ── DOCTOR & PATIENT CARDS ── */}
        <div className="px-10 pt-6 pb-2">
          <div className="grid grid-cols-2 gap-5">
            {/* Doctor card — blue left stripe */}
            <div className="border border-slate-200 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0f4c81] rounded-l-xl" />
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3 ml-3">Consulting Physician</p>
              <h2 className="text-xl font-bold text-[#0f4c81] ml-3 mb-2">{doctor.full_name || 'Dr. —'}</h2>
              <div className="ml-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Qualifications</span>
                  <span className="font-semibold text-slate-800">MBBS, MD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Medical Reg. No.</span>
                  <span className="font-semibold text-slate-800">—</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Provider</span>
                  <span className="font-semibold text-slate-800">GENESTAC THERAPEUTICS</span>
                </div>
              </div>
            </div>

            {/* Patient card — teal left stripe */}
            <div className="border border-slate-200 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600 rounded-l-xl" />
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3 ml-3">Patient Details</p>
              <h2 className="text-xl font-bold text-slate-800 ml-3 mb-2">{patient.name || 'Unknown Patient'}</h2>
              <div className="ml-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient ID</span>
                  <span className="font-semibold text-slate-800">PT-{rx.id.substring(0,8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contact</span>
                  <span className="font-semibold text-slate-800">{patient.phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email</span>
                  <span className="font-semibold text-slate-800 text-xs">{patient.email || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── DIAGNOSIS ── */}
        <div className="px-10 pt-6">
          <div className="flex items-center gap-2 text-base font-bold text-[#0f4c81] border-b-2 border-[#f0f4f8] pb-2 mb-3">
            Diagnosis &amp; Assessment
          </div>
          <div className="bg-[#f8fafc] border border-slate-200 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {rx.general_instructions || 'General consultation and prescription'}
          </div>
        </div>

        {/* ── PRESCRIPTION TABLE ── */}
        <div className="px-10 pt-6 pb-6">
          <div className="flex items-center gap-2 text-base font-bold text-[#0f4c81] border-b-2 border-[#f0f4f8] pb-2 mb-3">
            <span className="text-2xl font-serif">℞</span> Prescription Plan
          </div>
          {items.length > 0 ? (
            <table className="w-full border-collapse border border-slate-200 rounded-lg overflow-hidden text-sm">
              <thead>
                <tr className="bg-[#f8fafc]">
                  {['Medicine Name', 'Dosage', 'Frequency', 'Duration', 'Instructions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase text-slate-500 tracking-wide border-b border-slate-200">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => {
                  const instructions = [
                    item.before_lunch ? 'Before lunch' : '',
                    item.after_lunch  ? 'After lunch'  : '',
                    item.time         ? item.time       : '',
                  ].filter(Boolean).join(', ') || 'As directed'
                  return (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="px-4 py-3 border-b border-slate-100">
                        <span className="font-bold text-slate-800 block">{item.inventory?.name || 'Unknown'}</span>
                        <span className="text-[10px] text-slate-500 border border-slate-200 bg-slate-50 rounded px-1.5 mt-0.5 inline-block">Medication</span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100">{item.dosage || '—'}</td>
                      <td className="px-4 py-3 border-b border-slate-100">{item.frequency || '—'}</td>
                      <td className="px-4 py-3 border-b border-slate-100">{item.duration_days ? `${item.duration_days} Days` : '—'}</td>
                      <td className="px-4 py-3 border-b border-slate-100 text-slate-600">{instructions}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 italic">No medications prescribed.</p>
          )}
        </div>

        {/* ── FOOTER  (advice left | signature right) ── */}
        <div className="grid grid-cols-[2fr_1fr] gap-8 px-10 py-6 bg-[#f8fafc] border-t border-slate-200">
          {/* Left: advice */}
          <div>
            <div className="text-sm font-bold text-[#0f4c81] mb-3">Doctor&apos;s Advice &amp; Instructions</div>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><span className="text-[#0f4c81] font-bold mt-0.5">•</span>Maintain a balanced, calorie-deficit diet as discussed.</li>
              <li className="flex gap-2"><span className="text-[#0f4c81] font-bold mt-0.5">•</span>Ensure adequate hydration (at least 2.5 – 3 liters of water daily).</li>
              <li className="flex gap-2"><span className="text-[#0f4c81] font-bold mt-0.5">•</span>Incorporate 30 minutes of light to moderate exercise 5 days a week.</li>
              <li className="flex gap-2"><span className="text-[#0f4c81] font-bold mt-0.5">•</span>Follow up immediately if you experience any severe side effects.</li>
            </ul>
            <p className="mt-4 text-sm font-semibold text-slate-700">
              <strong>Next Follow-up:</strong> Review after 4 Weeks or earlier if required.
            </p>
          </div>

          {/* Right: signature */}
          <div className="flex flex-col items-center justify-end">
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full mb-5">
              ✓ Verified e-Prescription
            </div>
            <div className="w-full border-b border-slate-400 mb-2" />
            <p className="text-sm font-bold text-[#0f4c81]">{doctor.full_name || '—'}</p>
            <p className="text-xs text-slate-500 mt-0.5">Signature / Authorization</p>
          </div>
        </div>

        {/* ── BOTTOM BAR ── */}
        <div className="bg-[#0f4c81] text-white/90 text-xs text-center py-4 px-8">
          🔒 This prescription is confidential and intended solely for the patient named above. Generated by GENESTAC THERAPEUTICS LLP.
        </div>
      </div>
    </div>
  )
}
