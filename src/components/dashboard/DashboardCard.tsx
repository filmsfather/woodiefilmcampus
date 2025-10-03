'use client'

import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface DashboardCardProps {
  title: string
  description?: string
  icon?: LucideIcon
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function DashboardCard({
  title,
  description,
  icon: Icon,
  children,
  className,
  onClick
}: DashboardCardProps) {
  return (
    <Card 
      className={cn(
        'transition-all duration-200 hover:shadow-md',
        onClick && 'cursor-pointer hover:bg-gray-50',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          {Icon && <Icon className="h-5 w-5 text-gray-600" />}
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
        {description && (
          <p className="text-sm text-gray-600">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  )
}