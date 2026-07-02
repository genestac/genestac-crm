const fs = require('fs');

const appendCode = `
export async function uploadLeadDocument(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const leadId = formData.get('lead_id') as string
  const file = formData.get('file') as File

  if (!leadId || !file) throw new Error("Missing required fields")

  const fileExt = file.name.split('.').pop()
  const fileName = \`\${leadId}-\${Date.now()}.\${fileExt}\`
  const filePath = \`\${fileName}\`

  const { error: uploadError } = await supabase.storage
    .from('lead_documents')
    .upload(filePath, file)

  if (uploadError) throw new Error(uploadError.message)

  const { data: publicUrlData } = supabase.storage
    .from('lead_documents')
    .getPublicUrl(filePath)

  const { error: dbError } = await supabase
    .from('lead_documents')
    .insert({
      lead_id: leadId,
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      uploaded_by: user.id
    })

  if (dbError) throw new Error(dbError.message)

  return { success: true, url: publicUrlData.publicUrl }
}

export async function getLeadDocuments(leadId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lead_documents')
    .select('*')
    .eq('lead_id', leadId)
    .order('uploaded_at', { ascending: false })
  
  if (error) throw new Error(error.message)
  return data
}
`;

fs.appendFileSync('app/sales/actions.ts', appendCode);
