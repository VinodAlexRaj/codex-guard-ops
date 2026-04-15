'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString } from '@/lib/utils'

interface SiteRow {
  code: string
  name: string
  address: string
  activeShifts: number
  fillRate: number
  openSlots: number
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function SupervisorSitesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const [totalSites, setTotalSites] = useState(0)
  const [sitesWithGaps, setSitesWithGaps] = useState(0)
  const [fullyFilled, setFullyFilled] = useState(0)
  const [sitesData, setSitesData] = useState<SiteRow[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleSchedule = (siteCode: string) => {
    router.push(`/supervisor/sites/${siteCode}/schedule`)
  }

  // Set date string on client-side only
  useEffect(() => {
    const todayDate = new Date()
    const formatted = todayDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })
    setDateStr(formatted)
  }, [])

  // Fetch sites and coverage data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // FETCH 1 — Get current user's sites
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/')
          return
        }
        const { data: userData } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('id', user.id)
          .single()
        setCurrentUser(userData)

        const { data: supervisorSites } = await supabase
          .from('supervisor_sites')
          .select('site_id, sites(id, site_code, name, address)')
          .eq('supervisor_id', user.id)

        if (!supervisorSites || supervisorSites.length === 0) {
          setSitesData([])
          setTotalSites(0)
          setSitesWithGaps(0)
          setFullyFilled(0)
          setLoading(false)
          return
        }

        // FETCH 2 — Get today's coverage for each site
        const siteIds = supervisorSites.map(ss => ss.site_id)
        const today = getLocalDateString()

        const { data: coverage } = await supabase
          .from('roster_coverage')
          .select('site_id, assigned, required_headcount, is_fulfilled')
          .in('site_id', siteIds)
          .eq('shift_date', today)

        // FETCH 3 — Get shift definitions per site
        const { data: shiftDefs } = await supabase
          .from('shift_definitions')
          .select('id, site_id, shift_name')
          .in('site_id', siteIds)
          .eq('is_active', true)

        // BUILD TABLE ROWS
        const rows: SiteRow[] = supervisorSites.map(ss => {
          const site = firstRelated(ss.sites)
          const siteCoverage = coverage?.filter(c => c.site_id === ss.site_id) || []
          const activeShifts = shiftDefs?.filter(sd => sd.site_id === ss.site_id).length || 0
          const totalRequired = siteCoverage.reduce((sum, c) => sum + c.required_headcount, 0)
          const totalAssigned = siteCoverage.reduce((sum, c) => sum + c.assigned, 0)
          const openSlots = totalRequired - totalAssigned
          const fillRate = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 0

          return {
            code: site?.site_code || 'N/A',
            name: site?.name || 'Unknown site',
            address: site?.address || '',
            activeShifts,
            fillRate,
            openSlots,
          }
        })

        setSitesData(rows)

        // SUMMARY CARDS
        const calcTotalSites = rows.length
        const calcSitesWithGaps = rows.filter(s => s.openSlots > 0).length
        const calcFullyFilled = rows.filter(s => s.openSlots === 0).length

        setTotalSites(calcTotalSites)
        setSitesWithGaps(calcSitesWithGaps)
        setFullyFilled(calcFullyFilled)
      } catch (error) {
        console.error('[v0] Error fetching sites data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  // Filter sites based on search query
  const filteredSites = useMemo(() => {
    return sitesData.filter(
      (site) =>
        site.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.address.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery, sitesData])

  // Get fill rate color
  const getFillRateColor = (fillRate: number) => {
    if (fillRate >= 80) return 'bg-green-100 text-green-700'
    if (fillRate >= 50) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <>
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">{dateStr}</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{currentUser?.full_name || 'User'}</p>
              <Badge variant="secondary" className="mt-1">
                Supervisor
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-slate-600 hover:text-slate-900"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <div className="p-8">
        {/* Header with Search */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">My Sites</h3>
            <p className="text-sm text-slate-600">{totalSites} sites under your supervision</p>
          </div>
          <Input
            type="text"
            placeholder="Search site code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* Total Sites */}
          <Card className="border-slate-200 p-6">
            <p className="text-sm text-slate-600 mb-2">Total sites</p>
            <p className="text-3xl font-bold text-blue-600">{totalSites}</p>
          </Card>

          {/* Sites with Gaps */}
          <Card className="border-slate-200 p-6">
            <p className="text-sm text-slate-600 mb-2">Sites with gaps today</p>
            <p className="text-3xl font-bold text-red-600">{sitesWithGaps}</p>
          </Card>

          {/* Fully Filled */}
          <Card className="border-slate-200 p-6">
            <p className="text-sm text-slate-600 mb-2">Fully filled today</p>
            <p className="text-3xl font-bold text-green-600">{fullyFilled}</p>
          </Card>
        </div>

        {/* Sites Table */}
        <Card className="border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-600">Loading sites...</div>
          ) : filteredSites.length === 0 ? (
            <div className="p-8 text-center text-slate-600">
              {sitesData.length === 0 ? 'No sites found' : 'No sites match your search'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Site Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Site Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Address</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Active shifts</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Today&apos;s fill rate</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((site) => (
                  <tr key={site.code} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <code className="text-sm font-mono text-slate-900">{site.code}</code>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{site.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600">{site.address}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{site.activeShifts}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`border-0 ${getFillRateColor(site.fillRate)}`}>
                        {site.fillRate}%
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSchedule(site.code)}
                        className="text-teal-600 border-teal-200 hover:bg-teal-50"
                      >
                        Schedule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
