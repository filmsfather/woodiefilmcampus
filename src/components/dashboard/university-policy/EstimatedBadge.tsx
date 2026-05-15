import { AlertTriangle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export default function EstimatedBadge({ children = '추정치' }: { children?: React.ReactNode }) {
  return (
    <Badge className="gap-1 bg-amber-100 text-amber-800">
      <AlertTriangle className="size-3" />
      {children}
    </Badge>
  )
}
