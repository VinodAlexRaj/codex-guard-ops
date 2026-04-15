'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, MapPin, CalendarDays, ClipboardList, ShieldCheck, CalendarOff, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/sidebar-context'
import { supabase } from '@/lib/supabase/client'

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function SupervisorSidebar() {
  const pathname = usePathname()
  const { isCollapsed, toggle } = useSidebar()
  const [firstAssignedSiteCode, setFirstAssignedSiteCode] = useState<string | null>(null)

  useEffect(() => {
    const loadFirstAssignedSite = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: assignments } = await supabase
        .from('supervisor_sites')
        .select('sites(site_code)')
        .eq('supervisor_id', user.id)
        .limit(1)

      const site = firstRelated(assignments?.[0]?.sites)
      setFirstAssignedSiteCode(site?.site_code ?? null)
    }

    loadFirstAssignedSite()
  }, [])

  const currentSiteCode = pathname.match(/^\/supervisor\/sites\/([^/]+)/)?.[1] ?? null
  const siteCodeForLinks = currentSiteCode || firstAssignedSiteCode
  const scheduleHref = siteCodeForLinks
    ? `/supervisor/sites/${siteCodeForLinks}/schedule`
    : '/supervisor/sites'
  const attendanceHref = siteCodeForLinks
    ? `/supervisor/sites/${siteCodeForLinks}/attendance`
    : '/supervisor/sites'

  const navItems = [
    { label: 'Overview', href: '/supervisor/overview', icon: LayoutDashboard },
    { label: 'My Sites', href: '/supervisor/sites', icon: MapPin },
    { label: 'Schedule', href: scheduleHref, icon: CalendarDays },
    { label: 'Attendance', href: attendanceHref, icon: ClipboardList },
    { label: 'Guards', href: '/supervisor/guards', icon: ShieldCheck },
    { label: 'Leaves', href: '/supervisor/leaves', icon: CalendarOff },
  ]

  const isActive = (item: (typeof navItems)[number]) => {
    if (item.label === 'Overview') {
      return pathname === '/supervisor/overview'
    }
    if (item.label === 'My Sites') {
      return pathname.startsWith('/supervisor/sites') && !pathname.includes('/schedule') && !pathname.includes('/attendance')
    }
    if (item.label === 'Guards') {
      return pathname === '/supervisor/guards'
    }
    if (item.label === 'Leaves') {
      return pathname === '/supervisor/leaves'
    }
    if (item.label === 'Schedule') {
      return pathname.includes('/schedule')
    }
    if (item.label === 'Attendance') {
      return pathname.includes('/attendance')
    }
    return false
  }

  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside className={`sticky top-0 h-screen flex-shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out ${
      isCollapsed ? 'w-14' : 'w-56'
    }`}>
      {/* Toggle Button */}
      <div className="p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="w-full flex justify-center"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <ToggleIcon className="w-5 h-5" aria-hidden="true" />
        </Button>
      </div>

      {/* Logo */}
      {!isCollapsed && (
        <div className="px-6 mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Guard Ops</h2>
        </div>
      )}

      {/* Navigation */}
      <nav className={`space-y-2 px-3 ${isCollapsed ? '' : 'px-6'}`}>
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item)
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-[background-color,color] ${
                isCollapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
