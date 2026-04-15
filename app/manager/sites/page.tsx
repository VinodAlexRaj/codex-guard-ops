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
import { LogOut, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString } from '@/lib/utils'

interface SiteRow {
  code: string
  name: string
  supervisor: string
  activeShifts: number
  fillRate: number
  openSlots: number
  status: string
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export default function ManagerSitesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [supervisorFilter, setSupervisorFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const [managerName, setManagerName] = useState('User')
  const [allSites, setAllSites] = useState<SiteRow[]>([])
  const [supervisors, setSupervisors] = useState<string[]>(['All'])
  const [totalSites, setTotalSites] = useState(0)
  const [sitesWithGaps, setSitesWithGaps] = useState(0)
  const [fullyFilled, setFullyFilled] = useState(0)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleViewSite = (siteCode: string) => {
    router.push(`/manager/sites/${siteCode}`)
  }

  // Set date on mount
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

  // Fetch real data from Supabase
  useEffect(() => {
    const fetchSitesData = async () => {
      try {
        setLoading(true)

        // FETCH 1 — Get all sites
        const { data: sites } = await supabase
          .from('sites')
          .select('id, site_code, name, address')

        if (!sites || sites.length === 0) {
          setLoading(false)
          return
        }

        const siteIds = sites.map(s => s.id)

        // Get current manager name
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .single()
          if (userData?.full_name) setManagerName(userData.full_name)
        }

        // FETCH 2 — Get today's coverage
        const today = getLocalDateString()
        const { data: coverage } = await supabase
          .from('roster_coverage')
          .select('site_id, assigned, required_headcount')
          .in('site_id', siteIds)
          .eq('shift_date', today)

        // FETCH 3 — Get shift definitions count per site
        const { data: shiftDefs } = await supabase
          .from('shift_definitions')
          .select('id, site_id')
          .in('site_id', siteIds)
          .eq('is_active', true)

        // FETCH 4 — Get supervisor assignments
        const { data: supSites } = await supabase
          .from('supervisor_sites')
          .select('supervisor_id, site_id, users(full_name)')

        // BUILD TABLE ROWS
        const covData = coverage || []
        const shiftData = shiftDefs || []
        const supData = supSites || []

        const rows: SiteRow[] = sites.map(site => {
          const siteCov = covData.filter(c => c.site_id === site.id)
          const totalRequired = siteCov.reduce((sum, c) => sum + c.required_headcount, 0)
          const totalAssigned = siteCov.reduce((sum, c) => sum + c.assigned, 0)
          const fillRate = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 100
          const openSlots = Math.max(0, totalRequired - totalAssigned)

          const activeShifts = shiftData.filter(sd => sd.site_id === site.id).length
          const supervisorAssignment = supData.find(ss => ss.site_id === site.id)
          const supervisorUser = firstRelated(supervisorAssignment?.users)
          const supervisor = supervisorUser?.full_name || 'Unassigned'

          return {
            code: site.site_code,
            name: site.name,
            supervisor,
            activeShifts: activeShifts || 0,
            fillRate,
            openSlots,
            status: 'Active',
          }
        })
        setAllSites(rows)

        // Calculate summary stats
        const gaps = rows.filter(r => r.openSlots > 0).length
        const filled = rows.filter(r => r.openSlots === 0).length

        setTotalSites(rows.length)
        setSitesWithGaps(gaps)
        setFullyFilled(filled)

        // Extract unique supervisor names for filter
        const uniqueSupervisors = ['All', ...new Set(rows.map(r => r.supervisor).filter(s => s !== 'Unassigned'))]
        setSupervisors(uniqueSupervisors)
      } catch (error) {
        console.error('[v0] Error fetching sites:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSitesData()
  }, [router])

  // Filter and search
  const filteredSites = useMemo(() => {
    
    const filtered = allSites.filter((site) => {
      const matchesSearch =
        !searchQuery ||
        site.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.name.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesSupervisor = supervisorFilter === 'All' || site.supervisor === supervisorFilter
      const matchesStatus = statusFilter === 'All' || site.status === statusFilter

      return matchesSearch && matchesSupervisor && matchesStatus
    })
    return filtered
  }, [allSites, searchQuery, supervisorFilter, statusFilter])

  const getFillRateColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-100 text-green-700 border-0'
    if (rate >= 50) return 'bg-amber-100 text-amber-700 border-0'
    return 'bg-red-100 text-red-700 border-0'
  }

  return (
    <>
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">{dateStr}</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{managerName}</p>
              <Badge variant="secondary" className="mt-1">
                Manager
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
            <h1 className="text-lg font-bold text-slate-900 mb-1">All Sites</h1>
            <p className="text-sm text-slate-600">{totalSites} sites across {supervisors.length - 1} supervisors</p>
          </div>
          <Input
            type="text"
            placeholder="Search site code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>

        {/* Filter Bars */}
        <div className="mb-4 flex gap-6">
          {/* Supervisor Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Supervisor:</span>
            <div className="flex gap-2">
              {supervisors.map((sup) => (
                <button
                  key={sup}
                  onClick={() => setSupervisorFilter(sup)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    supervisorFilter === sup
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {sup}
                </button>
              ))}
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Status:</span>
            <div className="flex gap-2">
              {['All', 'Active', 'Inactive'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    statusFilter === status
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Row - 3 Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-50 border-blue-200 p-4">
            <div className="text-sm text-slate-600">Total sites</div>
            <div className="text-2xl font-bold text-blue-600">{totalSites}</div>
          </Card>
          <Card className="bg-red-50 border-red-200 p-4">
            <div className="text-sm text-slate-600">Sites with gaps today</div>
            <div className="text-2xl font-bold text-red-600">{sitesWithGaps}</div>
          </Card>
          <Card className="bg-green-50 border-green-200 p-4">
            <div className="text-sm text-slate-600">Fully filled</div>
            <div className="text-2xl font-bold text-green-600">{fullyFilled}</div>
          </Card>
        </div>

        {/* Sites Table */}
        <Card className="border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-600">Loading sites data...</div>
          ) : filteredSites.length === 0 ? (
            <div className="p-8 text-center text-slate-600">No sites found matching your filters.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr className="border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Site Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Site Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Supervisor</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Active shifts</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fill rate</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Open slots</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((site, idx) => (
                  <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium text-slate-900">{site.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{site.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700">{site.supervisor}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700">{site.activeShifts}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={getFillRateColor(site.fillRate)}>
                        {site.fillRate}%
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700">{site.openSlots}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewSite(site.code)}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        View
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Footer */}
        <div className="mt-4">
          <span className="text-sm text-slate-600">Showing {filteredSites.length} of {totalSites} sites</span>
        </div>
      </div>
    </>
  )
}
