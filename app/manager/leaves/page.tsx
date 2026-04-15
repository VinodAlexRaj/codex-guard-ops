'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LogOut, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString, formatLocalDate } from '@/lib/utils'

interface LeaveRow {
  id: string
  guardName: string
  guardCode: string
  type: string
  leaveDate: string
  status: string
  remarks: string | null
}

export default function ManagerLeavesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [dateStr, setDateStr] = useState('')
  const [managerName, setManagerName] = useState('User')
  const [allLeaves, setAllLeaves] = useState<LeaveRow[]>([])
  const [pendingApproval, setPendingApproval] = useState(0)
  const [approvedThisMonth, setApprovedThisMonth] = useState(0)
  const [onLeaveToday, setOnLeaveToday] = useState(0)
  const [rejectedThisMonth, setRejectedThisMonth] = useState(0)

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

  // Fetch leave data
  useEffect(() => {
    const fetchLeaveData = async () => {
      try {
        setLoading(true)

        // FETCH 1 — Get manager name
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: userData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', user.id)
            .single()
          if (userData?.full_name) setManagerName(userData.full_name)
        }

        // FETCH 2 — Get all leaves
        const { data: leaves } = await supabase
          .from('leaves')
          .select('id, user_id, external_emp_code, leave_type, leave_status, leave_date, remarks')
          .order('leave_date', { ascending: false })

        if (!leaves || leaves.length === 0) {
          setLoading(false)
          return
        }

        // FETCH 3 — Get guard names
        const userIds = [...new Set(leaves.map(l => l.user_id))]
        const { data: guards } = await supabase
          .from('users')
          .select('id, full_name, external_employee_code')
          .in('id', userIds)

        // BUILD TABLE ROWS
        const guardMap = new Map((guards || []).map(g => [g.id, g]))

        const rows: LeaveRow[] = (leaves || []).map(leave => ({
          id: leave.id,
          guardName: guardMap.get(leave.user_id)?.full_name || 'Unknown',
          guardCode: leave.external_emp_code || 'N/A',
          type: leave.leave_type,
          leaveDate: formatLocalDate(leave.leave_date),
          status: leave.leave_status,
          remarks: leave.remarks,
        }))

        setAllLeaves(rows)

        // CALCULATE SUMMARY STATS
        const today = getLocalDateString()
        const currentMonth = today.substring(0, 7) // YYYY-MM format

        const pending = (leaves || []).filter(l => l.leave_status === 'Pending').length
        const approved = (leaves || []).filter(
          l => l.leave_status === 'Approved' && l.leave_date.startsWith(currentMonth)
        ).length
        const today_leaves = (leaves || []).filter(
          l => l.leave_date === today && l.leave_status === 'Approved'
        ).length
        const rejected = (leaves || []).filter(
          l => l.leave_status === 'Rejected' && l.leave_date.startsWith(currentMonth)
        ).length

        setPendingApproval(pending)
        setApprovedThisMonth(approved)
        setOnLeaveToday(today_leaves)
        setRejectedThisMonth(rejected)
      } catch (error) {
        console.error('[v0] Error fetching leave data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLeaveData()
  }, [router])

  // Filter leaves
  const filteredRecords = useMemo(() => {
    return allLeaves.filter(record => {
      const matchSearch =
        !searchQuery ||
        record.guardName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.guardCode.toLowerCase().includes(searchQuery.toLowerCase())
      const matchStatus = statusFilter === 'All' || record.status === statusFilter
      const matchType = typeFilter === 'All' || record.type === typeFilter
      return matchSearch && matchStatus && matchType
    })
  }, [allLeaves, searchQuery, statusFilter, typeFilter])

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'AL': return 'bg-purple-100 text-purple-700'
      case 'MC': return 'bg-red-100 text-red-700'
      case 'EL': return 'bg-amber-100 text-amber-700'
      case 'UL': return 'bg-blue-100 text-blue-700'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Approved': return 'bg-green-100 text-green-700'
      case 'Pending': return 'bg-amber-100 text-amber-700'
      case 'Rejected': return 'bg-red-100 text-red-700'
      default: return 'bg-slate-100 text-slate-700'
    }
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Leave Management</h1>
          <p className="text-slate-600">Review and manage all leave requests</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4 border-slate-200">
            <p className="text-xs text-slate-600 mb-1">Pending approval</p>
            <p className="text-2xl font-bold text-amber-600">{pendingApproval}</p>
          </Card>
          <Card className="p-4 border-slate-200">
            <p className="text-xs text-slate-600 mb-1">Approved this month</p>
            <p className="text-2xl font-bold text-green-600">{approvedThisMonth}</p>
          </Card>
          <Card className="p-4 border-slate-200">
            <p className="text-xs text-slate-600 mb-1">On leave today</p>
            <p className="text-2xl font-bold text-blue-600">{onLeaveToday}</p>
          </Card>
          <Card className="p-4 border-slate-200">
            <p className="text-xs text-slate-600 mb-1">Rejected this month</p>
            <p className="text-2xl font-bold text-red-600">{rejectedThisMonth}</p>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex gap-4 items-center">
          <Input
            type="text"
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Filter Pills */}
        <div className="mb-6 flex gap-6">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Status:</span>
            <div className="flex gap-2">
              {['All', 'Approved', 'Pending', 'Rejected'].map((status) => (
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

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Type:</span>
            <div className="flex gap-2">
              {['All', 'AL', 'MC', 'EL', 'UL'].map((type) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    typeFilter === type
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">i</span>
          </div>
          <p className="text-sm text-blue-800">
            Leave approvals are managed in Info-Tech HRMS. This page displays synced data only.
          </p>
        </div>

        {/* Leave Requests Table */}
        <Card className="border-slate-200 overflow-hidden mb-6">
          {loading ? (
            <div className="p-8 text-center text-slate-600">Loading leave data...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-slate-600">No leave requests found.</div>
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
                {filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{record.guardName}</div>
                      <div className="text-xs text-slate-600">{record.guardCode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${getTypeColor(record.type)} border-0`}>
                        {record.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900">{record.leaveDate}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${getStatusColor(record.status)} border-0`}>
                        {record.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600">{record.remarks || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Sync Section */}
        <Card className="border-slate-200 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Leave data is synced from Info-Tech HRMS</p>
            <p className="text-xs text-slate-600">Approvals and rejections must be done in the HR system. Last synced: 2 hours ago</p>
          </div>
          <Button
            disabled
            className="bg-slate-400 text-white hover:bg-slate-400"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync now
          </Button>
        </Card>
      </div>
    </>
  )
}
