import { Construction } from 'lucide-react'

interface WorkInProgressProps {
  title?: string;
  description?: string;
}

export function WorkInProgress({ 
  title = "Module in Development", 
  description = "We are currently building and testing this section. Check back soon!" 
}: WorkInProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-white rounded-xl border shadow-sm">
      <div className="h-24 w-24 bg-amber-50 rounded-full flex items-center justify-center mb-6">
        <Construction className="w-12 h-12 text-amber-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-3">{title}</h2>
      <p className="text-muted-foreground max-w-md text-lg">{description}</p>
    </div>
  )
}
