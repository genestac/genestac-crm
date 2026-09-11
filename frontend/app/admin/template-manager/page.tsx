import { getTemplateTriggers } from './actions'
import TemplateManagerClient from './TemplateManagerClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Template Manager | Genestac CRM' }

export default async function TemplateManagerPage() {
  let data: any = { triggers: [], all_templates: [] }
  try {
    data = await getTemplateTriggers()
  } catch (_) {}
  return <TemplateManagerClient initialData={data} />
}
