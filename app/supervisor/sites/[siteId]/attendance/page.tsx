'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LogOut, ChevronLeft, CheckCircle2 } from 'lucide-react'
import { getLocalDateString } from '@/lib/utils'

interface AttendanceRow {
  id: string
  assignmentId: string
  guardId: string
  name: string
  code: string
  checkIn: string
  checkOut: string
  status: string | null
  remarks: string
  otMins: number
  otReason: string
  saved: boolean
  shiftEndTime: string
}

export default function AttendancePage() {
  const router = useRouter()
  const params = useParams()
  const siteId = params.siteId as string

  const [activeShift, setActiveShift] = useState<string | null>(null)
  const [shifts, setShifts] = useState<any[]>([])
  const [attendanceData, setAttendanceData] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [siteName, setSiteName] = useState('')

  // Fetch attendance data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

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

        // 1. Get site UUID from site_code
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('id, name')
          .eq('site_code', siteId.toUpperCase())
          .single()

        if (siteError || !site) {
          throw new Error('Site not found')
        }
        setSiteName(site.name) // Use site name for display

        // 2. Get shift definitions for this site
        const { data: shiftDefs } = await supabase
          .from('shift_definitions')
          .select('id, shift_name, shift_code, start_time, end_time')
          .eq('site_id', site.id)
          .eq('is_active', true)
          .order('start_time')

        setShifts(shiftDefs || [])
        if (shiftDefs && shiftDefs.length > 0) {
          setActiveShift(shiftDefs[0].shift_name)
        }

        // 3. Get roster slots for today
        const today = getLocalDateString()
        const { data: slots } = await supabase
          .from('roster_slots')
          .select('id, shift_definition_id, start_time, end_time')
          .eq('site_id', site.id)
          .eq('shift_date', today)

        if (!slots || slots.length === 0) {
          setAttendanceData([])
          return
        }

        // 4. Get assignments for today's slots
        const slotIds = slots.map(s => s.id)
        const { data: assignments, error: assignError } = await supabase
          .from('shift_assignments')
          .select('id, roster_slot_id, guard_id')
          .in('roster_slot_id', slotIds)
          .eq('is_cancelled', false)

        if (!assignments) return

        // 5. Get guard details separately
        const guardIds = [...new Set(assignments?.map(a => a.guard_id) || [])]

        const { data: guardDetails } = await supabase
          .from('users')
          .select('id, full_name, external_employee_code')
          .in('id', guardIds)

        // 6. Get existing attendance records
        const assignmentIds = assignments.map(a => a.id)
        const { data: existingAttendance } = await supabase
          .from('attendance')
          .select('*')
          .in('shift_assignment_id', assignmentIds)

        // 7. Build rows by combining assignments, guards, and attendance
        const rows: AttendanceRow[] = (assignments || []).map(assignment => {
          const slot = slots.find(s => s.id === assignment.roster_slot_id)
          const guard = guardDetails?.find(g => g.id === assignment.guard_id)
          const existing = existingAttendance?.find(
            a => a.shift_assignment_id === assignment.id
          )

          return {
            id: `${assignment.id}`,
            assignmentId: assignment.id,
            guardId: assignment.guard_id,
            name: guard?.full_name || 'Unknown',
            code: guard?.external_employee_code || 'N/A',
            checkIn: existing?.check_in_time
              ? new Date(existing.check_in_time).toLocaleTimeString('en-MY', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })
              : '',
            checkOut: existing?.check_out_time
              ? new Date(existing.check_out_time).toLocaleTimeString('en-MY', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                })
              : '',
            status: existing?.status || null,
            remarks: existing?.remarks || '',
            otMins: existing?.overtime_minutes || 0,
            otReason: existing?.overtime_reason || '',
            saved: !!existing,
            shiftEndTime: shiftDefs?.find(sd => sd.id === slot?.shift_definition_id)?.end_time?.slice(0, 5) || '14:00',
          }
        })

        setAttendanceData(rows)
      } catch (error) {
        console.error('[v0] Error fetching attendance data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router, siteId])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleBackToSchedule = () => {
    router.push(`/supervisor/sites/${siteId}/schedule`)
  }

  const calculateOvertimeMinutes = (checkOutTime: string, shiftEndTime: string): number => {
    if (!checkOutTime || !shiftEndTime) return 0

    const [endHour, endMin] = shiftEndTime.split(':').map(Number)
    const [checkHour, checkMin] = checkOutTime.split(':').map(Number)

    const endTotalMins = endHour * 60 + endMin
    const checkTotalMins = checkHour * 60 + checkMin

    if (checkTotalMins > endTotalMins) {
      return checkTotalMins - endTotalMins
    }
    return 0
  }

  const updateAttendance = (id: string, field: string, value: any) => {
    setAttendanceData(
      attendanceData.map((row) => {
        if (row.id !== id) return row

        const updated = { ...row, [field]: value, saved: false }

        // Auto-calculate OT when check-out time changes
        if (field === 'checkOut') {
          updated.otMins = calculateOvertimeMinutes(value, row.shiftEndTime)
        }

        return updated
      })
    )
  }

  const saveRow = async (id: string) => {
    const row = attendanceData.find(r => r.id === id)
    if (!row) return
    if (!currentUser?.id) {
      alert('Please sign in again before saving attendance.')
      router.replace('/')
      return
    }

    try {
      // Map display status to database status values
      const statusMap: Record<string, string> = {
        'on_time': 'on_time',
        'On time': 'on_time',
        'late': 'late',
        'Late': 'late',
        'absent': 'absent',
        'Absent': 'absent',
        'MC': 'mc',
        'AL': 'al',
        'EL': 'el',
        'UL': 'ul',
      }

      const today = getLocalDateString()
      const checkInTimestamp = row.checkIn ? `${today}T${row.checkIn}:00+08:00` : null
      const checkOutTimestamp = row.checkOut ? `${today}T${row.checkOut}:00+08:00` : null
      const dbStatus = row.status ? (statusMap[row.status] || 'on_time') : 'on_time'

      const { error } = await supabase
        .from('attendance')
        .upsert(
          {
            shift_assignment_id: row.assignmentId,
            check_in_time: checkInTimestamp,
            check_out_time: checkOutTimestamp,
            status: dbStatus,
            remarks: row.remarks || null,
            overtime_minutes: row.otMins || 0,
            overtime_reason: row.otReason || null,
            recorded_by: currentUser.id,
          },
          {
            onConflict: 'shift_assignment_id',
          }
        )

      if (error) {
        console.error('[v0] SAVE ERROR:', JSON.stringify(error))
        alert('Save failed: ' + error.message)
        return
      }

      setAttendanceData(
        attendanceData.map((r) => (r.id === id ? { ...r, saved: true } : r))
      )
    } catch (error) {
      console.error('[v0] Error saving attendance:', error)
      alert('Failed to save attendance record')
    }
  }

  const saveAllPending = async () => {
    const pending = attendanceData.filter(r => !r.saved)
    for (const row of pending) {
      await saveRow(row.id)
    }
  }

  const markAllOnTime = () => {
    setAttendanceData(
      attendanceData.map((row) => ({
        ...row,
        status: 'on_time',
        saved: false,
      }))
    )
  }

  const getStatusColor = (status: string | null) => {
    if (status === 'on_time') return 'bg-green-100 text-green-700 border-0'
    if (status === 'late') return 'bg-amber-100 text-amber-700 border-0'
    if (status === 'absent') return 'bg-red-100 text-red-700 border-0'
    if (status === 'mc') return 'bg-blue-100 text-blue-700 border-0'
    if (status === 'al' || status === 'el' || status === 'ul') return 'bg-purple-100 text-purple-700 border-0'
    return 'border border-slate-300 text-slate-600'
  }

  const statusOptions = ['on_time', 'late', 'absent', 'mc', 'al', 'el', 'ul']
  const statusLabels: Record<string, string> = {
    on_time: 'On time',
    late: 'Late',
    absent: 'Absent',
    mc: 'MC',
    al: 'AL',
    el: 'EL',
    ul: 'UL',
  }

  const filteredData = activeShift
    ? attendanceData.filter((row) => {
        const shiftDef = shifts.find(s => s.shift_name === activeShift)
        return row.shiftEndTime === shiftDef?.end_time?.slice(0, 5)
      })
    : attendanceData

  const savedCount = filteredData.filter((r) => r.saved).length
  const pendingCount = filteredData.filter((r) => !r.saved).length
  const onTimeCount = filteredData.filter((r) => r.status === 'on_time').length
  const lateCount = filteredData.filter((r) => r.status === 'late').length
  const absentCount = filteredData.filter((r) => r.status === 'absent').length
  const onLeaveCount = filteredData.filter((r) =>
    ['mc', 'al', 'el', 'ul'].includes(r.status)
  ).length
  const pendingStatusCount = filteredData.filter((r) => !r.status).length
  const withOTCount = filteredData.filter((r) => r.otMins > 0).length

  const todayDate = new Date()
  const dateStr = todayDate.toLocaleDateString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-slate-600">Loading attendance data...</p>
      </div>
    )
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

      {/* Back Button */}
      <div className="border-b border-slate-200 bg-white px-8 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToSchedule}
          className="text-slate-600 hover:text-slate-900 pl-0"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Schedule
        </Button>
      </div>

      {/* Page Content */}
      <div className="p-8">
        {/* Title and Subtitle */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Attendance — {siteName}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{dateStr}</p>
        </div>

        {/* Shift Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          {shifts.map((shift) => (
            <button
              key={shift.shift_name}
              onClick={() => setActiveShift(shift.shift_name)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeShift === shift.shift_name
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {shift.shift_name} {shift.start_time?.slice(0, 5)}-{shift.end_time?.slice(0, 5)}
            </button>
          ))}
        </div>

        {/* Summary Bar */}
        <Card className="border-slate-200 p-4 mb-6 flex items-center justify-between">
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-600"></div>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{onTimeCount}</span> On time
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-600"></div>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{lateCount}</span> Late
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600"></div>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{absentCount}</span> Absent
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-600"></div>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{onLeaveCount}</span> On leave
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-slate-400"></div>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{pendingStatusCount}</span> Pending
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{withOTCount}</span> With OT
              </span>
            </div>
          </div>
          <div className="text-sm text-slate-600">
            Recorded by: <span className="font-medium text-slate-900">{currentUser?.full_name || 'Unknown'}</span>
          </div>
        </Card>

        {/* Attendance Table */}
        <Card className="border-slate-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Guard</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Check-in</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Check-out</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">OT (mins)</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">OT reason</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Remarks</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-200 hover:bg-slate-50 ${
                      row.otMins > 0 ? 'border-l-4 border-l-amber-500' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-600">{row.code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Input
                        type="time"
                        value={row.checkIn}
                        onChange={(e) => updateAttendance(row.id, 'checkIn', e.target.value)}
                        className="w-24 text-sm"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Input
                        type="time"
                        value={row.checkOut}
                        onChange={(e) => updateAttendance(row.id, 'checkOut', e.target.value)}
                        className="w-24 text-sm"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {statusOptions.map((status) => (
                          <button
                            key={status}
                            onClick={() => updateAttendance(row.id, 'status', status)}
                            className={`px-2 py-1 rounded text-xs font-medium transition ${
                              row.status === status
                                ? getStatusColor(status)
                                : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {statusLabels[status]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Input
                        type="number"
                        value={row.otMins}
                        onChange={(e) => updateAttendance(row.id, 'otMins', parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-16 text-sm"
                        min="0"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Input
                        type="text"
                        value={row.otReason}
                        onChange={(e) => updateAttendance(row.id, 'otReason', e.target.value)}
                        placeholder="Overtime reason..."
                        className="text-sm"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <Input
                        type="text"
                        value={row.remarks}
                        onChange={(e) => updateAttendance(row.id, 'remarks', e.target.value)}
                        placeholder="Add remarks"
                        className="text-sm max-w-xs"
                      />
                    </td>
                    <td className="px-6 py-4">
                      {row.saved ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-medium">Saved</span>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => saveRow(row.id)}
                          className="bg-teal-600 hover:bg-teal-700 text-white"
                        >
                          Save
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Footer Bar */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{filteredData.length}</span> guards ·{' '}
            <span className="font-semibold text-slate-900">{savedCount}</span> saved ·{' '}
            <span className="font-semibold text-slate-900">{pendingCount}</span> pending
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={markAllOnTime}
              className="text-slate-700 border-slate-300 hover:bg-slate-50"
            >
              Mark all on time
            </Button>
            <Button
              size="sm"
              onClick={saveAllPending}
              disabled={pendingCount === 0}
              className="bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
            >
              Save all pending
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
