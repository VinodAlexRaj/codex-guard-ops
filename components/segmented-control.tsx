import { cn } from '@/lib/utils'

interface SegmentedControlProps<T extends string> {
  label: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div aria-label={label} className="flex flex-wrap gap-2" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cn(
            'rounded-full px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2',
            value === option
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
