import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  tone: 'red' | 'amber' | 'green' | 'blue'
}

const toneClasses = {
  red: 'border-red-200 bg-red-50 text-red-600',
  amber: 'border-amber-200 bg-amber-50 text-amber-600',
  green: 'border-green-200 bg-green-50 text-green-600',
  blue: 'border-blue-200 bg-blue-50 text-blue-600',
}

export function MetricCard({ label, value, icon: Icon, tone }: MetricCardProps) {
  return (
    <Card className={cn('border p-5 sm:p-6', toneClasses[tone])}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs text-slate-600">{label}</p>
          <p className="text-3xl font-bold tabular-nums">{value}</p>
        </div>
        <Icon className="size-5 shrink-0" aria-hidden="true" />
      </div>
    </Card>
  )
}
