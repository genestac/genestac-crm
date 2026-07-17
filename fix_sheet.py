import re

with open('frontend/components/sales/user-management-sheet.tsx', 'r') as f:
    text = f.read()

# Replace Payment button in footer
text = text.replace("onClick={() => setActiveTab('payment')}", "onClick={() => setActiveTab('orders')}")

overview_start = text.find('{/* OVERVIEW TAB */}')
pipeline_start = text.find('{/* PIPELINE TAB */}')
payment_start = text.find('{/* PAYMENT & INVOICE TAB */}')
appointments_start = text.find('{/* APPOINTMENTS TAB */}')
files_start = text.find('{/* FILES & NOTES TAB */}')

if -1 in [overview_start, pipeline_start, payment_start, appointments_start, files_start]:
    raise Exception("Markers not found!")

pipeline_raw = text[pipeline_start:payment_start]
# We want to grab everything inside {activeTab === "pipeline" && ( ... )}
# Find the outermost div inside the condition
match = re.search(r'\{activeTab === "pipeline" && \(\s*<div className="space-y-8">\s*(.*)\s*</div>\s*\)\}', pipeline_raw, re.DOTALL)
if match:
    pipeline_inner = match.group(1)
    
    # We must be careful not to truncate nested divs. The regex `.*` is greedy and will capture up to the LAST `</div>` before `)}`.
    # Let's verify by just splitting next_followup_date
    followup_match = re.search(r'<div className="space-y-1\.5">\s*<Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Next Follow-up</Label>.*?</div>', pipeline_inner, re.DOTALL)
    
    if followup_match:
        followup_inner = followup_match.group(0)
        pipeline_inner = pipeline_inner.replace(followup_inner, '')
        
        marker = '<Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Interaction Timeline</Label>'
        new_followup = f'''
                  <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                      <h3 className="font-bold text-amber-900 mb-1 flex items-center"><Calendar className="w-4 h-4 mr-1.5" /> Next Follow-up Date</h3>
                      <p className="text-xs text-amber-700">Set the next scheduled follow-up for this lead.</p>
                    </div>
                    <Input 
                      name="next_followup_date" 
                      type="datetime-local" 
                      value={{formData.next_followup_date}}
                      onChange={{handleInputChange}}
                      className="bg-white rounded-xl border-amber-200 transition-all hover:bg-gray-50 focus:bg-white shadow-sm w-auto"
                    />
                  </div>
                  '''
        text = text.replace(marker, new_followup + marker)
    
    styled_pipeline = """
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center"><Activity className="w-4 h-4 mr-1.5 text-primary" /> Pipeline Settings</h4>
                  <div className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm space-y-6">
""" + pipeline_inner.strip() + """
                  </div>
                </div>
"""
    # Insert before the closing tags of Overview
    idx = text.rfind('</div>\n            )}', overview_start, pipeline_start)
    text = text[:idx] + styled_pipeline + text[idx:]

# Re-read because we modified text length
pipeline_start = text.find('{/* PIPELINE TAB */}')
payment_start = text.find('{/* PAYMENT & INVOICE TAB */}')
text = text[:pipeline_start] + text[payment_start:]


# Now Orders
payment_start = text.find('{/* PAYMENT & INVOICE TAB */}')
appointments_start = text.find('{/* APPOINTMENTS TAB */}')
files_start = text.find('{/* FILES & NOTES TAB */}')

payment_raw = text[payment_start:appointments_start]
appt_raw = text[appointments_start:files_start]

pay_match = re.search(r'\{activeTab === "payment" && \(\s*<div className="space-y-6">\s*(.*)\s*</div>\s*\)\}', payment_raw, re.DOTALL)
appt_match = re.search(r'\{activeTab === "appointments" && \(\s*<div className="space-y-6">\s*(.*)\s*</div>\s*\)\}', appt_raw, re.DOTALL)

if pay_match and appt_match:
    combined = f"""            {{/* ORDERS & BOOKINGS TAB */}}
            {{activeTab === "orders" && (
              <div className="flex flex-col xl:flex-row gap-8">
                <div className="space-y-6 flex-1">
{pay_match.group(1)}
                </div>
                <div className="hidden xl:block w-px bg-gray-100 self-stretch"></div>
                <div className="xl:hidden h-px w-full bg-gray-100 my-4"></div>
                <div className="space-y-6 flex-1">
{appt_match.group(1)}
                </div>
              </div>
            )}}
"""
    text = text[:payment_start] + combined + text[files_start:]

with open('frontend/components/sales/user-management-sheet.tsx', 'w') as f:
    f.write(text)
print("SUCCESS")
