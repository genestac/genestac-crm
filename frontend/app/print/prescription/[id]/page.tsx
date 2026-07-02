import { getPrescriptionById } from '@/app/doctor/actions'
import { notFound } from 'next/navigation'
import PrintTrigger from './print-trigger'

export default async function PrintPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  let rx
  try {
    rx = await getPrescriptionById(id)
  } catch (err) {
    console.error(err)
  }

  if (!rx) {
    notFound()
  }

  return (
    <div className="max-w-4xl mx-auto p-12 bg-white min-h-screen text-gray-900 font-sans print:p-0 print:w-full">
      <PrintTrigger />
      
      {/* Header */}
      <div className="border-b-2 border-teal-600 pb-6 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-teal-800 tracking-tight">Genestac Clinic</h1>
          <p className="text-gray-500 mt-1">123 Health Ave, Medical District, NY 10001</p>
          <p className="text-gray-500">Phone: (555) 123-4567 | info@genestac.com</p>
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold">{rx.doctors?.full_name || 'Dr. Smith'}</h2>
          <p className="text-teal-700 font-medium text-sm">Consultant Physician</p>
        </div>
      </div>

      {/* Patient Info */}
      <div className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Patient Name</p>
          <p className="text-lg font-bold">{rx.patients?.name || 'Unknown Patient'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Date</p>
          <p className="text-lg font-bold">{new Date(rx.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="text-6xl font-serif text-teal-800 opacity-20 mb-6 font-bold absolute pointer-events-none">
        Rx
      </div>
      
      <div className="pl-8 relative z-10 min-h-[400px]">
        {rx.prescription_items && rx.prescription_items.length > 0 ? (
          <div className="space-y-8 mt-12">
            {rx.prescription_items.map((item: any, i: number) => (
              <div key={i} className="border-b border-gray-100 pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold">{item.inventory?.name || 'Unknown Product'}</h3>
                    <p className="text-sm text-gray-600 mt-1 font-medium">{item.dosage}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{item.duration_days} Days</p>
                    <p className="text-xs text-gray-500">Dispense: {item.total_quantity_prescribed}</p>
                  </div>
                </div>
                
                <div className="mt-4 flex gap-4 text-sm text-gray-800 bg-gray-50/50 p-3 rounded-lg">
                  <span className="font-semibold">Take: {item.frequency}</span>
                  {(item.time || item.before_lunch || item.after_lunch) && (
                    <span className="text-gray-400">|</span>
                  )}
                  {item.time && <span>Time: {item.time}</span>}
                  {item.before_lunch && <span>(Before Lunch)</span>}
                  {item.after_lunch && <span>(After Lunch)</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic mt-12">No medications prescribed.</p>
        )}
      </div>

      {rx.general_instructions && (
        <div className="mt-12 p-6 border-2 border-gray-100 rounded-xl">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Special Instructions</p>
          <p className="text-gray-800 whitespace-pre-wrap">{rx.general_instructions}</p>
        </div>
      )}

      {/* Footer / Signature */}
      <div className="mt-24 pt-8 flex justify-end">
        <div className="text-center w-64 border-t border-gray-400 pt-2">
          <p className="font-bold text-gray-900">{rx.doctors?.full_name || 'Doctor Signature'}</p>
          <p className="text-sm text-gray-500 mt-1">Medical License #193489</p>
        </div>
      </div>

    </div>
  )
}
