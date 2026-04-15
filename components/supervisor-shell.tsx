'use client'

import SupervisorSidebar from '@/components/supervisor-sidebar'
import { SidebarProvider } from '@/components/sidebar-context'

export function SupervisorShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider storageKey="supervisor-sidebar-collapsed">
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <SupervisorSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SidebarProvider>
  )
}
