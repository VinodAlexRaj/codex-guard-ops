'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LogOut, AlertCircle, PieChart } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString } from '@/lib/utils'

interface SupervisorData {
  id: string
  name: string
  code: string
  sites: number
  guards: number
  fillRate: number
  gaps: number
  status: string
}

export default function ManagerSupervisorsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const [managerName, setManagerName] = useState('User')
  const [supervisors, setSupervisors] = useState<SupervisorData[]>([])
  const [totalSupervisors, setTotalSupervisors] = useState(0)
  const [sitesWithGaps, setSitesWithGaps] = useState(0)
  const [avgFillRate, setAvgFillRate] = useState(0)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
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

  // Fetch supervisor data
  useEffect(() => {
    const fetchSupervisorData = async () => {
      try {
        setLoading(true)

        // FETCH 1 - Get current manager name
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .single()
          if (userData?.full_name) setManagerName(userData.full_name)
        }

        // FETCH 2 - Get all supervisors
        const { data: supUsers } = await supabase
          .from('users')
          .select('id, full_name, external_employee_code, is_active')
          .eq('external_role', 'OPERATIONS EXECUTIVE')
          .eq('is_active', true)

        if (!supUsers || supUsers.length === 0) {
          setLoading(false)
          return
        }

        const supIds = supUsers.map(s => s.id)

        // FETCH 3 - Get supervisor site assignments
        const { data: supSites } = await supabase
          .from('supervisor_sites')
          .select('supervisor_id, site_id')

        // FETCH 4 - Get today's coverage for all sites
        const today = getLocalDateString()
        const allSiteIds = [...new Set((supSites || []).map(ss => ss.site_id))]

        const { data: coverage } = await supabase
          .from('roster_coverage')
          .select('site_id, assigned, required_headcount')
          .in('site_id', allSiteIds)
          .eq('shift_date', today)

        // FETCH 5 - Get guard counts per supervisor
        const { data: assignments } = await supabase
          .from('shift_assignments')
          .select('guard_id, site_id')
          .in('site_id', allSiteIds)
          .eq('is_cancelled', false)

        // BUILD SUPERVISOR CARDS
        const supSiteData = supSites || []
        const covData = coverage || []
        const assignData = assignments || []

        const supData: SupervisorData[] = (supUsers || []).map(sup => {
          // Get sites for this supervisor
          const mySiteIds = supSiteData
            .filter(ss => ss.supervisor_id === sup.id)
            .map(ss => ss.site_id)

          // Get coverage for this supervisor's sites
          const myCoverage = covData.filter(c => mySiteIds.includes(c.site_id))
          const totalRequired = myCoverage.reduce((sum, c) => sum + c.required_headcount, 0)
          const totalAssigned = myCoverage.reduce((sum, c) => sum + c.assigned, 0)
          const fillRate = totalRequired > 0
            ? Math.round((totalAssigned / totalRequired) * 100)
            : 100

          // Count open slots
          const openSlots = totalRequired - totalAssigned

          // Count unique guards for this supervisor
          const myGuards = new Set(
            assignData
              .filter(a => mySiteIds.includes(a.site_id))
              .map(a => a.guard_id)
          ).size

          return {
            id: sup.id,
            name: sup.full_name,
            code: sup.external_employee_code || 'N/A',
            sites: mySiteIds.length,
            guards: myGuards,
            fillRate,
            gaps: openSlots,
            status: 'Active',
          }
        })

        setSupervisors(supData)

        // Calculate summary stats
        const totalGaps = supData.reduce((sum, s) => sum + (s.gaps > 0 ? 1 : 0), 0)
        const totalReq = covData.reduce((sum, c) => sum + c.required_headcount, 0)
        const totalAsgn = covData.reduce((sum, c) => sum + c.assigned, 0)
        const orgFillRate = totalReq > 0 ? Math.round((totalAsgn / totalReq) * 100) : 0

        setTotalSupervisors(supData.length)
        setSitesWithGaps(totalGaps)
        setAvgFillRate(orgFillRate)
      } catch (error) {
        console.error('[v0] Error fetching supervisor data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSupervisorData()
  }, [router])

  const getFillRateBadgeColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-100 text-green-700'
    if (rate >= 50) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  const getFillRateBarColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500'
    if (rate >= 50) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
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
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Supervisors</h1>
          <p className="text-slate-600">{totalSupervisors} supervisors managing {supervisors.reduce((sum, s) => sum + s.sites, 0)} sites</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-blue-50 border-blue-200 border p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total supervisors</p>
                <p className="text-3xl font-bold text-blue-600">{totalSupervisors}</p>
              </div>
              <div className="text-4xl text-blue-200 opacity-50">👥</div>
            </div>
          </Card>
          <Card className="bg-red-50 border-red-200 border p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Sites with gaps</p>
                <p className="text-3xl font-bold text-red-600">{sitesWithGaps}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-200 opacity-50" />
            </div>
          </Card>
          <Card className="bg-green-50 border-green-200 border p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Avg fill rate</p>
                <p className="text-3xl font-bold text-green-600">{avgFillRate}%</p>
              </div>
              <PieChart className="w-8 h-8 text-green-200 opacity-50" />
            </div>
          </Card>
        </div>

        {/* Supervisors Table */}
        <Card className="border-slate-200 overflow-hidden mb-8">
          {loading ? (
            <div className="p-8 text-center text-slate-600">Loading supervisor data...</div>
          ) : supervisors.length === 0 ? (
            <div className="p-8 text-center text-slate-600">No supervisors found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr className="border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Supervisor</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Sites</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Guards</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fill rate today</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Gaps</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {supervisors.map((supervisor) => (
                  <tr key={supervisor.id} className="border-b border-slate-200 hover:bg-slate-50">
                    {/* Supervisor Name + Code */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-teal-600 text-white text-xs font-bold">
                          {getInitials(supervisor.name)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{supervisor.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{supervisor.code}</div>
                        </div>
                      </div>
                    </td>

                    {/* Sites */}
                    <td className="px-4 py-3 text-sm text-slate-700">{supervisor.sites} sites</td>

                    {/* Guards */}
                    <td className="px-4 py-3 text-sm text-slate-700">{supervisor.guards} guards</td>

                    {/* Fill Rate */}
                    <td className="px-4 py-3">
                      <Badge className={`${getFillRateBadgeColor(supervisor.fillRate)} border-0`}>
                        {supervisor.fillRate}%
                      </Badge>
                    </td>

                    {/* Gaps */}
                    <td className="px-4 py-3 text-sm text-red-600 font-medium">
                      {supervisor.gaps} {supervisor.gaps === 1 ? 'gap' : 'gaps'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge className="bg-green-100 text-green-700 border-0">{supervisor.status}</Badge>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="text-slate-700 border-slate-300 hover:bg-slate-50"
                      >
                        <Link href={`/manager/supervisors/${supervisor.code}`}>
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Performance Chart Section */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Supervisor performance today</h2>
          <Card className="border-slate-200 p-6">
            {loading ? (
              <div className="text-center text-slate-600 py-8">Loading...</div>
            ) : supervisors.length === 0 ? (
              <div className="text-center text-slate-600 py-8">No data available</div>
            ) : (
              <div className="space-y-4">
                {supervisors.map((supervisor) => (
                  <div key={supervisor.id} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium text-slate-700">{supervisor.name}</div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full ${getFillRateBarColor(supervisor.fillRate)} transition-[width]`}
                        style={{ width: `${supervisor.fillRate}%` }}
                      ></div>
                    </div>
                    <div className="w-12 text-right text-sm font-medium text-slate-700">{supervisor.fillRate}%</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}


