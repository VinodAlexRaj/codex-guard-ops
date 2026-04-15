'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'

interface AppTopBarProps {
  date: string
  name: string
  role: 'Manager' | 'Supervisor'
}

export function AppTopBar({ date, name, role }: AppTopBarProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <header className="border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <time className="text-sm text-slate-600" dateTime={new Date().toISOString()}>
          {date}
        </time>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium text-slate-900">{name}</p>
            <Badge variant="secondary" className="mt-1">
              {role}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-slate-600 hover:text-slate-900"
          >
            <LogOut className="mr-2 size-4" aria-hidden="true" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  )
}
