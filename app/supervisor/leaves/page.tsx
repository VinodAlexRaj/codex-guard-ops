'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { LogOut, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString, formatLocalDate } from '@/lib/utils'

export default function SupervisorLeavesPage() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [dateStr, setDateStr] = useState('')
  const [loading, setLoading] = useState(true)
  const [allLeaves, setAllLeaves] = useState<any[]>([])
  const [onLeaveTodayCount, setOnLeaveTodayCount] = useState(0)
  const [alThisMonthCount, setAlThisMonthCount] = useState(0)
  const [mcThisMonthCount, setMcThisMonthCount] = useState(0)
  const [elThisMonthCount, setElThisMonthCount] = useState(0)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

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

  useEffect(() => {
    const fetchUser = async () => {
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
    }
    fetchUser()
  }, [router])

  // Fetch leaves data
  useEffect(() => {
    const fetchLeavesData = async () => {
      try {
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // FETCH 1 — Get supervisor's sites
        const { data: supervisorSites } = await supabase
          .from('supervisor_sites')
          .select('site_id')
          .eq('supervisor_id', user.id)

        if (!supervisorSites || supervisorSites.length === 0) {
          setAllLeaves([])
          setLoading(false)
          return
        }

        const siteIds = supervisorSites.map(ss => ss.site_id)

        // FETCH 2 — Get guard IDs assigned to these sites
        const { data: assignments } = await supabase
          .from('shift_assignments')
          .select('guard_id')
          .in('site_id', siteIds)
          .eq('is_cancelled', false)

        if (!assignments || assignments.length === 0) {
          setAllLeaves([])
          setLoading(false)
          return
        }

        const guardIds = [...new Set(assignments.map(a => a.guard_id))]

        // FETCH 3 — Get leaves for these guards
        const { data: leaves } = await supabase
          .from('leaves')
          .select('id, user_id, leave_type, leave_status, leave_date, remarks, external_emp_code')
          .in('user_id', guardIds)
          .order('leave_date', { ascending: true })

        // FETCH 4 — Get guard names
        const { data: guards } = await supabase
          .from('users')
          .select('id, full_name, external_employee_code')
          .in('id', guardIds)

        // BUILD LEAVE TABLE with combined data
        const leaveRows = (leaves || []).map(leave => {
          const guard = guards?.find(g => g.id === leave.user_id)
          return {
            id: leave.id,
            guardId: leave.user_id,
            guardName: guard?.full_name || 'Unknown',
            guardCode: guard?.external_employee_code || leave.external_emp_code || 'N/A',
            leaveType: leave.leave_type,
            leaveDate: leave.leave_date,
            status: leave.leave_status,
            remarks: leave.remarks || '—',
          }
        })

        setAllLeaves(leaveRows)

        // CALCULATE SUMMARY STATS from real data
        const today = getLocalDateString()
        const currentDate = new Date()
        const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0')
        const currentYear = currentDate.getFullYear().toString()

        const onLeaveToday = leaveRows.filter(
          l => l.leaveDate === today && l.status === 'Approved'
        ).length

        // Compare date strings directly to avoid timezone issues
        const alThisMonth = leaveRows.filter(l => {
          const [leaveYear, leaveMonth] = l.leaveDate.split('-')
          return l.leaveType === 'AL' && l.status === 'Approved' &&
            leaveMonth === currentMonth &&
            leaveYear === currentYear
        }).length

        const mcThisMonth = leaveRows.filter(l => {
          const [leaveYear, leaveMonth] = l.leaveDate.split('-')
          return l.leaveType === 'MC' && l.status === 'Approved' &&
            leaveMonth === currentMonth &&
            leaveYear === currentYear
        }).length

        const elThisMonth = leaveRows.filter(l => {
          const [leaveYear, leaveMonth] = l.leaveDate.split('-')
          return l.leaveType === 'EL' && l.status === 'Approved' &&
            leaveMonth === currentMonth &&
            leaveYear === currentYear
        }).length

        setOnLeaveTodayCount(onLeaveToday)
        setAlThisMonthCount(alThisMonth)
        setMcThisMonthCount(mcThisMonth)
        setElThisMonthCount(elThisMonth)
      } catch (error) {
        console.error('[v0] Error fetching leaves:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLeavesData()
  }, [router])

  // Mock data for summary stats
  const summaryStats = [
    { label: 'On leave today', value: onLeaveTodayCount, color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-600' },
    { label: 'AL this month', value: alThisMonthCount, color: 'bg-purple-50 border-purple-200', textColor: 'text-purple-600' },
    { label: 'MC this month', value: mcThisMonthCount, color: 'bg-red-50 border-red-200', textColor: 'text-red-600' },
    { label: 'EL this month', value: elThisMonthCount, color: 'bg-amber-50 border-amber-200', textColor: 'text-amber-600' },
  ]

  // Week data - Mon to Sun of current week
  const today = new Date()
  const currentDayOfWeek = today.getDay() || 7
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - currentDayOfWeek + 1)
  
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)
    return date
  })
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // Build week view data from allLeaves
  const weekLeaves = allLeaves.filter(leave => {
    // Get YYYY-MM-DD strings for both week boundaries and leave date
    const [leaveYear, leaveMonth, leaveDay] = leave.leaveDate.split('-')
    const leaveDate = `${leaveYear}-${leaveMonth}-${leaveDay}`
    
    const [weekStartYear, weekStartMonth, weekStartDay] = getLocalDateString(weekStart).split('-')
    const weekStartStr = `${weekStartYear}-${weekStartMonth}-${weekStartDay}`
    
    // Calculate week end (7 days later)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const [weekEndYear, weekEndMonth, weekEndDay] = getLocalDateString(weekEnd).split('-')
    const weekEndStr = `${weekEndYear}-${weekEndMonth}-${weekEndDay}`
    
    // Compare date strings directly
    return leaveDate >= weekStartStr && leaveDate < weekEndStr
  })

  // Group by guard
  const guardWeekLeaves = Array.from(
    new Map(
      weekLeaves.map(leave => [leave.guardId, leave])
    ).entries()
  ).map(([guardId, leave]) => {
    const guardLeaves: (string | null)[] = Array(7).fill(null)
    
    weekLeaves
      .filter(l => l.guardId === guardId && l.status === 'Approved')
      .forEach(l => {
        // Compare date strings directly instead of converting to Date objects
        const [leaveYear, leaveMonth, leaveDay] = l.leaveDate.split('-')
        const leaveDate = `${leaveYear}-${leaveMonth}-${leaveDay}`
        
        for (let i = 0; i < 7; i++) {
          const dayDate = new Date(weekStart)
          dayDate.setDate(dayDate.getDate() + i)
          const dayDateStr = getLocalDateString(dayDate)
          
          if (leaveDate === dayDateStr) {
            guardLeaves[i] = l.leaveType
            break
          }
        }
      })

    const sampleLeave = weekLeaves.find(l => l.guardId === guardId)
    return {
      guardId,
      guardName: sampleLeave?.guardName || 'Unknown',
      guardCode: sampleLeave?.guardCode || 'N/A',
      leaves: guardLeaves,
    }
  }).sort((a, b) => a.guardName.localeCompare(b.guardName))

  const getLeaveColor = (type: string | null) => {
    if (type === 'AL') return 'bg-purple-100 text-purple-700'
    if (type === 'MC') return 'bg-red-100 text-red-700'
    if (type === 'EL') return 'bg-amber-100 text-amber-700'
    if (type === 'UL') return 'bg-slate-100 text-slate-700'
    return 'bg-slate-50 text-slate-400'
  }

  const getLeaveLabel = (type: string | null) => {
    if (!type) return '—'
    return type
  }

  const getStatusBadgeColor = (status: string) => {
    if (status === 'Approved') return 'bg-green-100 text-green-700'
    if (status === 'Pending') return 'bg-amber-100 text-amber-700'
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
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Leave calendar</h3>
            <p className="text-sm text-slate-600">Guards on leave — Apr 2026</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                viewMode === 'week'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                viewMode === 'month'
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              Month
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Leave approvals are managed in Info-Tech HRMS. This page displays synced data only.
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {summaryStats.map((stat) => (
            <Card
              key={stat.label}
              className={`border-2 p-4 ${stat.color}`}
            >
              <p className={`text-sm font-medium ${stat.textColor} mb-2`}>{stat.label}</p>
              <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
            </Card>
          ))}
        </div>

        {/* Calendar - Week View */}
        {viewMode === 'week' && (
          <>
            <div className="mb-8">
              <h4 className="text-sm font-semibold text-slate-700 mb-4">
                Week of {days[0].toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} - {days[6].toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}
              </h4>
              <Card className="border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 w-40">Guard</th>
                        {days.map((day, idx) => (
                          <th
                            key={idx}
                            className="px-4 py-3 text-center text-sm font-semibold text-slate-700 min-w-20"
                          >
                            <div>{dayNames[idx]}</div>
                            <div className="text-xs text-slate-500">{day.getDate()}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {guardWeekLeaves.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                            No leave records for this week
                          </td>
                        </tr>
                      ) : (
                        guardWeekLeaves.map((guard) => (
                          <tr key={guard.guardId} className="border-b border-slate-200 hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-slate-900">{guard.guardName}</div>
                              <div className="text-xs text-slate-500">{guard.guardCode}</div>
                            </td>
                            {guard.leaves.map((leave, idx) => (
                              <td key={idx} className="px-4 py-3 text-center">
                                {leave ? (
                                  <Badge className={`${getLeaveColor(leave)} border-0 w-full`}>
                                    {getLeaveLabel(leave)}
                                  </Badge>
                                ) : (
                                  <div className="text-sm text-slate-300">—</div>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* Month View Placeholder */}
        {viewMode === 'month' && (
          <Card className="border-slate-200 p-8 mb-8">
            <p className="text-center text-slate-500">Month view coming soon</p>
          </Card>
        )}

        {/* Upcoming Leave Table */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Leave records</h4>
          <Card className="border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-slate-600">Loading leave records...</div>
            ) : allLeaves.length === 0 ? (
              <div className="p-8 text-center text-slate-600">
                No leave records found for your guards.
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Guard</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {allLeaves.map((leave) => (
                    <tr key={leave.id} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{leave.guardName}</div>
                        <div className="text-xs text-slate-500">{leave.guardCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${getLeaveColor(leave.leaveType)} border-0`}>
                          {leave.leaveType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatLocalDate(leave.leaveDate)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${getStatusBadgeColor(leave.status)} border-0`}>
                          {leave.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{leave.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
