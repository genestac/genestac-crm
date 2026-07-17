import re

with open('frontend/components/sales/user-management-sheet.tsx', 'r') as f:
    content = f.read()

# 1. Update tabs array
old_tabs = """          {[
            { id: "overview", label: "Overview", icon: User },
            { id: "pipeline", label: "Pipeline", icon: Activity },
            { id: "payment", label: "Payment", icon: CreditCard },
            { id: "appointments", label: "Appointments", icon: Calendar },
            { id: "files", label: "Files & Notes", icon: FileText },
            { id: "call_logs", label: "AI Calls", icon: Phone },
            { id: "whatsapp", label: "WhatsApp", icon: MessageCircle }
          ].map(tab => ("""

new_tabs = """          {[
            { id: "overview", label: "Overview", icon: User },
            { id: "files", label: "Files & Notes", icon: FileText },
            { id: "orders", label: "Orders & Bookings", icon: Receipt },
            { id: "call_logs", label: "AI Calls", icon: Phone },
            { id: "whatsapp", label: "WhatsApp", icon: MessageCircle }
          ].map(tab => ("""

content = content.replace(old_tabs, new_tabs)

# 2. Extract Pipeline tab content
pipeline_match = re.search(r'\{\/\* PIPELINE TAB \*\/\}\s*\{activeTab === "pipeline" && \((.*?)\)\}\n', content, re.DOTALL)
if pipeline_match:
    pipeline_content = pipeline_match.group(1)
    # Remove the pipeline tab from the content entirely
    content = content.replace(pipeline_match.group(0), "")
    
    # We want to extract the status/priority/source/plan parts from pipeline_content and add them to overview
    # Wait, the pipeline content also has next_followup_date. We need to move next_followup_date to Files & Notes
    
    followup_match = re.search(r'<div className="space-y-1\.5">\s*<Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Next Follow-up</Label>\s*<Input\s*name="next_followup_date"\s*type="datetime-local"\s*value=\{formData\.next_followup_date\}\s*onChange=\{handleInputChange\}\s*className="bg-muted\/50 rounded-xl border-border\/50 transition-all hover:bg-muted focus:bg-card shadow-inner shadow-none"\s*\/>\s*<\/div>', pipeline_content, re.DOTALL)
    
    if followup_match:
        followup_html = followup_match.group(0)
        pipeline_content = pipeline_content.replace(followup_html, "")
        
        # Inject followup into Files & Notes, just above "Interaction Timeline"
        files_notes_marker = '<Label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Interaction Timeline</Label>'
        new_files_notes = f'''<div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
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
                  </div>\n                  ''' + files_notes_marker
        content = content.replace(files_notes_marker, new_files_notes)
        
    # Now merge remaining pipeline content into overview.
    # The pipeline content is a div with className="space-y-8". Let's extract the two grid-cols-2 inside it.
    grids_match = re.findall(r'<div className="grid grid-cols-2 gap-6">(.*?)<\/div>\s*<\/div>', pipeline_content + "</div>", re.DOTALL)
    # Actually, let's just append the pipeline content into the overview tab
    # Overview tab ends with `</div>\n            )}\n`
    
    overview_tab_end = '</div>\n            )}\n'
    
    # Let's find where overview tab ends.
    overview_end_index = content.find(overview_tab_end)
    if overview_end_index != -1:
        # We will insert a styled section before the end of the overview tab
        styled_pipeline = """
                <div className="pt-6 mt-6 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center"><Activity className="w-4 h-4 mr-1.5 text-primary" /> Pipeline Settings</h4>
                  <div className="p-5 bg-white border border-gray-100 rounded-xl shadow-sm space-y-6">
""" + pipeline_content.replace('<div className="space-y-8">', '').strip()[:-6] + """
                  </div>
                </div>
"""
        
        # We want to replace the last `</div>` of overview with `styled_pipeline + </div>`
        # Overview tab ends with:
        #                 )}
        #               </div>
        #             )}
        
        # Let's use a regex to match the end of the overview tab
        match = re.search(r'(\s*\{/\* PIPELINE TAB \*/\})', content)
        if match:
            pos = match.start()
            # We need to backtrack to the closing </div> of the overview tab
            last_div_pos = content.rfind('</div>', 0, pos)
            content = content[:last_div_pos] + styled_pipeline + content[last_div_pos:]

# 3. Combine Payment and Appointments into Orders
# Find Payment tab and Appointments tab
payment_match = re.search(r'\{\/\* PAYMENT & INVOICE TAB \*\/\}\s*\{activeTab === "payment" && \((.*?)\)\}\n', content, re.DOTALL)
appt_match = re.search(r'\{\/\* APPOINTMENTS TAB \*\/\}\s*\{activeTab === "appointments" && \((.*?)\)\}\n', content, re.DOTALL)

if payment_match and appt_match:
    payment_content = payment_match.group(1).replace('<div className="space-y-6">', '<div className="space-y-6 flex-1">')
    appt_content = appt_match.group(1).replace('<div className="space-y-6">', '<div className="space-y-6 flex-1">')
    
    combined_orders = f"""            {{/* ORDERS & BOOKINGS TAB */}}
            {{activeTab === "orders" && (
              <div className="flex flex-col xl:flex-row gap-8">
                {payment_content}
                <div className="hidden xl:block w-px bg-gray-100 self-stretch"></div>
                <div className="xl:hidden h-px w-full bg-gray-100 my-4"></div>
                {appt_content}
              </div>
            )}}
"""
    # Replace Payment
    content = content.replace(payment_match.group(0), combined_orders)
    # Remove Appointments
    content = content.replace(appt_match.group(0), "")

# 4. Action Footer: Update Payment link button since "payment" tab is now "orders"
footer_button = """<button 
              type="button" 
              onClick={() => setActiveTab('payment')}"""
new_footer_button = """<button 
              type="button" 
              onClick={() => setActiveTab('orders')}"""
content = content.replace(footer_button, new_footer_button)

with open('frontend/components/sales/user-management-sheet.tsx', 'w') as f:
    f.write(content)

print("Done")
