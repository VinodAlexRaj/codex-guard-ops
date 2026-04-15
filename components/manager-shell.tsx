'use client'

import ManagerSidebar from '@/components/manager-sidebar'
import { SidebarProvider } from '@/components/sidebar-context'

export function ManagerShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider storageKey="manager-sidebar-collapsed">
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <ManagerSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SidebarProvider>
  )
}
