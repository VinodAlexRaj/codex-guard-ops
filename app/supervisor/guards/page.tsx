'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LogOut, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString } from '@/lib/utils'

interface Guard {
  id: string
  name: string
  code: string
  status: 'Active' | 'On leave'
  leaves: Array<{ type: string; date: string }>
  sites: string[]
  initials: string
}

export default function GuardsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const [guards, setGuards] = useState<Guard[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)

  const filteredGuards = useMemo(() => {
    return guards.filter((guard) => {
      const matchesSearch =
        guard.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guard.code.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = statusFilter === 'All' || guard.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [searchQuery, statusFilter, guards])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleSchedule = (guardName: string) => {
    router.push('/supervisor/sites/KLSNT01/schedule')
  }

  const getLeaveColor = (leaveType: string) => {
    if (leaveType.startsWith('AL')) return 'bg-purple-100 text-purple-700'
    if (leaveType.startsWith('MC')) return 'bg-red-100 text-red-700'
    if (leaveType.startsWith('EL')) return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-700'
  }

  const getAvatarColor = () => {
    return 'bg-teal-600'
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

  // Fetch guards data
  useEffect(() => {
    const fetchGuards = async () => {
      try {
        setLoading(true)

        // Get current user
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

        // FETCH 1 — Get supervisor's sites
        const { data: supervisorSites } = await supabase
          .from('supervisor_sites')
          .select('site_id, sites(site_code)')
          .eq('supervisor_id', user.id)

        if (!supervisorSites || supervisorSites.length === 0) {
          setGuards([])
          setLoading(false)
          return
        }

        const siteIds = supervisorSites.map(ss => ss.site_id)

        // FETCH 2 — Get guards assigned to these sites
        const { data: assignments } = await supabase
          .from('shift_assignments')
          .select('guard_id')
          .in('site_id', siteIds)
          .eq('is_cancelled', false)

        const guardIds = [...new Set(assignments?.map(a => a.guard_id) || [])]

        if (guardIds.length === 0) {
          setGuards([])
          setLoading(false)
          return
        }

        // FETCH 3 — Get guard details
        const { data: guardDetails } = await supabase
          .from('users')
          .select('id, full_name, external_employee_code, external_role, is_active')
          .in('id', guardIds)
          .in('external_role', ['SECURITY OFFICER', 'NEPALESE SECURITY OFFICER'])

        // FETCH 4 — Get leaves for this week and today
        const today = getLocalDateString()
        const { data: leaves } = await supabase
          .from('leaves')
          .select('user_id, leave_type, leave_status, leave_date')
          .in('user_id', guardIds)
          .eq('leave_status', 'Approved')
          .gte('leave_date', today)

        // FETCH 5 — Get all assignments to get site codes
        const { data: allAssignments } = await supabase
          .from('shift_assignments')
          .select('guard_id, sites(site_code)')
          .in('guard_id', guardIds)
          .eq('is_cancelled', false)

        // BUILD TABLE ROWS
        const guardsArray: Guard[] = (guardDetails || []).map(guard => {
          const guardLeaves = leaves?.filter(l => l.user_id === guard.id) || []
          const guardAssignments = allAssignments?.filter(a => a.guard_id === guard.id) || []
          const siteCodes = [...new Set(guardAssignments.map(a => a.sites?.site_code).filter(Boolean))]

          // Check if guard is on leave today
          const leavesToday = guardLeaves.filter(l => l.leave_date === today)
          const isOnLeaveToday = leavesToday.length > 0

          // Format leaves this week
          const formattedLeaves = guardLeaves.map(l => ({
            type: l.leave_type,
            date: l.leave_date,
          }))

          // Get initials
          const nameParts = guard.full_name.split(' ')
          const initials = nameParts.length >= 2
            ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
            : guard.full_name.substring(0, 2).toUpperCase()

          return {
            id: guard.id,
            name: guard.full_name,
            code: guard.external_employee_code,
            status: guard.is_active && isOnLeaveToday ? 'On leave' : guard.is_active ? 'Active' : 'On leave',
            leaves: formattedLeaves,
            sites: siteCodes,
            initials,
          }
        })

        setGuards(guardsArray)
      } catch (error) {
        console.error('[v0] Error fetching guards:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchGuards()
  }, [router])

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
            <h3 className="text-lg font-bold text-slate-900 mb-1">Guards</h3>
            <p className="text-sm text-slate-600">{guards.length} guards across your sites</p>
          </div>
          <Input
            type="text"
            placeholder="Search name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>

        {/* Filter Bar */}
        <div className="mb-4 flex gap-6">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Status:</span>
            <div className="flex gap-2">
              {['All', 'Active', 'On leave'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    statusFilter === status
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Guards Table */}
        <Card className="border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-600">Loading guards...</div>
          ) : filteredGuards.length === 0 ? (
            <div className="p-8 text-center text-slate-600">
              {guards.length === 0 ? 'No guards found' : 'No guards match your search'}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr className="border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Guard</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Leave this week</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Assigned sites</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredGuards.map((guard) => (
                  <tr
                    key={guard.id}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    {/* Guard Name + Code */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${getAvatarColor()}`}
                        >
                          {guard.initials}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{guard.name}</div>
                          <div className="text-xs text-slate-500">{guard.code}</div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge
                        className={`border-0 ${
                          guard.status === 'Active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {guard.status}
                      </Badge>
                    </td>

                    {/* Leave */}
                    <td className="px-4 py-3">
                      {guard.leaves.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {guard.leaves.map((leave, idx) => (
                            <Badge key={idx} className={`border-0 ${getLeaveColor(leave.type)}`}>
                              {leave.type} {leave.date}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Sites */}
                    <td className="px-4 py-3">
                      {guard.sites.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {guard.sites.map((site) => (
                            <Badge key={site} variant="outline" className="bg-slate-50 text-slate-700">
                              {site}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSchedule(guard.name)}
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

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">Showing {filteredGuards.length} of {guards.length} guards</span>
          <div className="flex gap-6 text-sm font-medium">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-600"></div>
              <span className="text-green-600">{guards.filter(g => g.status === 'Active').length} active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-600"></div>
              <span className="text-amber-600">{guards.filter(g => g.status === 'On leave').length} on leave</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
