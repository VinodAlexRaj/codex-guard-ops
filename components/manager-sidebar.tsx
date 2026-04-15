'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Building2, Users, CalendarClock, ShieldCheck, CalendarOff, BarChart3, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/sidebar-context'

const navItems = [
  { label: 'Overview', href: '/manager/overview', icon: LayoutDashboard },
  { label: 'All Sites', href: '/manager/sites', icon: Building2 },
  { label: 'Supervisors', href: '/manager/supervisors', icon: Users },
  { label: 'Shift Setup', href: '/manager/shifts', icon: CalendarClock },
  { label: 'Guard Management', href: '/manager/guards', icon: ShieldCheck },
  { label: 'Leave Management', href: '/manager/leaves', icon: CalendarOff },
  { label: 'Reports', href: '/manager/reports', icon: BarChart3 },
]

export default function ManagerSidebar() {
  const pathname = usePathname()
  const { isCollapsed, toggle } = useSidebar()

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/')
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
          const active = isActive(item.href)
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-[background-color,color] ${
                isCollapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-slate-100 text-slate-900'
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
