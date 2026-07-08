import { getAISettings, getKnowledgeBase } from '../actions'
import { AdminAICallingClient } from './AdminAICallingClient'

export const metadata = {
  title: 'AI Voice Calling | Admin',
  description: 'Configure automated AI voice calling and RAG context.',
}

export default async function AdminAICallingPage() {
  const settings = await getAISettings()
  const kb = await getKnowledgeBase()

  return <AdminAICallingClient initialSettings={settings} initialKnowledgeBase={kb} />
}
