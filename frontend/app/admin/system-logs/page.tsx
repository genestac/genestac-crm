import { SystemLogsClient } from './SystemLogsClient'

export const metadata = {
  title: 'System Logs | Genestac Admin',
  description: 'Live backend system log stream',
}

export default function SystemLogsPage() {
  return <SystemLogsClient />
}
