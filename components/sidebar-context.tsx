'use client'

import { createContext, useCallback, useContext, useMemo, useState, useEffect, ReactNode } from 'react'

interface SidebarContextValue {
  isCollapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  isCollapsed: false,
  toggle: () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}

export function SidebarProvider({
  children,
  storageKey,
}: {
  children: ReactNode
  storageKey: string
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved) setIsCollapsed(saved === 'true')
  }, [storageKey])

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(storageKey, String(next))
      return next
    })
  }, [storageKey])

  const value = useMemo(() => ({ isCollapsed, toggle }), [isCollapsed, toggle])

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  )
}
