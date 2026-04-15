'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { getLocalDateString } from '@/lib/utils'

export default function SchedulePage() {
  const router = useRouter()
  const params = useParams()
  const siteId = params.siteId as string

  // Helper function to get the Monday of the current week
  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay() // 0=Sun, 1=Mon, 2=Tue...
    // If Sunday (0), go back 6 days to Monday
    // Otherwise go back (day - 1) days to Monday
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  // State for transformed data
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => {
    return getWeekStart(new Date())
  })
  const [dayViewDate, setDayViewDate] = useState<Date>(() => new Date())
  const [selectedCell, setSelectedCell] = useState({ shiftIndex: 1, dayIndex: 2 }) // Wed Afternoon pre-selected
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGuard, setSelectedGuard] = useState<{ id: string; full_name: string; status: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [slots, setSlots] = useState<any[]>([])
  const [shiftDefs, setShiftDefs] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [guardNames, setGuardNames] = useState<any[]>([])
  const [guardsDirectory, setGuardsDirectory] = useState<any[]>([])
  const [siteUUID, setSiteUUID] = useState<string | null>(null)
  const [coverageData, setCoverageData] = useState<number[]>([100, 100, 100, 100, 100, 100, 100])
  const [guardShiftCounts, setGuardShiftCounts] = useState<Map<string, Map<string, number>>>(new Map()) // Map<dateStr, Map<guardId, count>>
  const [guardLeave, setGuardLeave] = useState<any[]>([])

  // Ref to maintain persistent reference to slots data
  const slotsRef = useRef<any[]>([])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleBackToOverview = () => {
    router.push('/supervisor/overview')
  }

  const weekStart = weekStartDate
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6) // 6 days after Monday = Sunday
  const today = new Date()
  const todayStr = getLocalDateString(today)
  const weekStartStr = getLocalDateString(weekStart)
  const weekEndStr = getLocalDateString(weekEnd)

  const shifts = [
    { name: 'Morning', code: 'MRN', time: '06:00-14:00', required: 3 },
    { name: 'Afternoon', code: 'AFT', time: '14:00-22:00', required: 2 },
    { name: 'Night', code: 'NGT', time: '22:00-06:00', required: 2 },
  ]

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + i)
    return date
  })

  const dayNames = days.map(date => {
    const dayName = date.toLocaleDateString('en-MY', { weekday: 'short' })
    const dayNum = date.getDate()
    return `${dayName} ${dayNum}`
  })

  // Initialize and fetch schedule data from Supabase
  useEffect(() => {
    const initializeData = async () => {
      try {
        setLoading(true)
        // First, resolve the site UUID from site code
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('id')
          .eq('site_code', siteId.toUpperCase())
          .single()

        if (siteError || !site) {
          setError('Site not found: ' + siteId)
          setLoading(false)
          return
        }
        setSiteUUID(site.id)

        // Now fetch all data using the site UUID
        await Promise.all([fetchSchedule(site.id), fetchGuards()])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load schedule')
        console.error('[v0] Error loading schedule:', err)
      } finally {
        setLoading(false)
      }
    }

    initializeData()
  }, [siteId, weekStartStr, weekEndStr])

  async function fetchSchedule(actualSiteUUID: string) {
    try {

      // Query 1 - get roster slots
      const { data: slotsData, error: slotsError } = await supabase
        .from('roster_slots')
        .select('id, shift_date, start_time, end_time, shift_definition_id, site_id')
        .eq('site_id', actualSiteUUID)
        .gte('shift_date', weekStartStr)
        .lte('shift_date', weekEndStr)

      if (slotsError) throw slotsError
      if (!slotsData || slotsData.length === 0) {
        setSlots([])
        return
      }

      // Query 2 - get shift definitions for this site
      const { data: shiftDefsData, error: shiftDefsError } = await supabase
        .from('shift_definitions')
        .select('id, shift_name, shift_code, required_headcount')
        .eq('site_id', actualSiteUUID)
        .eq('is_active', true)

      if (shiftDefsError) throw shiftDefsError

      // Query 3 - get assignments for these slots
      const slotIds = slotsData.map(s => s.id)
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('shift_assignments')
        .select('id, roster_slot_id, guard_id, assignment_type, is_cancelled')
        .in('roster_slot_id', slotIds)
        .eq('is_cancelled', false)

      if (assignmentsError) throw assignmentsError

      // Query 4 - get names for ALL assigned users (including non-guards for display)
      const guardIds = [...new Set(assignmentsData?.map(a => a.guard_id) || [])]
      const { data: guardsData } = guardIds.length > 0
        ? await supabase
            .from('users')
            .select('id, full_name, external_employee_code, external_role')
            .in('id', guardIds)
        : { data: [] }

      // Query 5 - get guard leave records for this week
      const { data: leaveData } = await supabase
        .from('guard_leave_records')
        .select('id, guard_id, leave_start_date, leave_end_date, status')
        .gte('leave_end_date', weekStartStr)
        .lte('leave_start_date', weekEndStr)
        .eq('status', 'approved')

      // Update state with separate data
      slotsRef.current = slotsData
      setSlots(slotsData)
      setShiftDefs(shiftDefsData || [])
      setAssignments(assignmentsData || [])
      setGuardNames(guardsData || [])
      setGuardLeave(leaveData || [])

      // Calculate guard shift counts per day for shift overload warnings
      calculateGuardShiftCounts(assignmentsData || [], slotsData)
    } catch (err) {
      console.error('[v0] fetchSchedule error:', err)
      throw err
    }
  }

  function calculateGuardShiftCounts(assignmentsData: any[], slotsData: any[]) {
    const countMap = new Map<string, Map<string, number>>()

    // For each assignment, increment the count for that guard on that date
    assignmentsData.forEach((assignment: any) => {
      const slot = slotsData.find(s => s.id === assignment.roster_slot_id)
      if (!slot) return

      const dateStr = slot.shift_date // format: YYYY-MM-DD
      if (!countMap.has(dateStr)) {
        countMap.set(dateStr, new Map())
      }

      const guardMap = countMap.get(dateStr)!
      const currentCount = guardMap.get(assignment.guard_id) || 0
      guardMap.set(assignment.guard_id, currentCount + 1)
    })

    setGuardShiftCounts(countMap)
  }

  function getShiftNameForAssignment(assignmentId: string): string | null {
    // Find the assignment
    const assignment = assignments.find(a => a.id === assignmentId)
    if (!assignment) return null

    // Find the slot
    const slot = slotsRef.current.find(s => s.id === assignment.roster_slot_id)
    if (!slot) return null

    // Find the shift definition
    const shiftDef = shiftDefs.find(sd => sd.id === slot.shift_definition_id)
    return shiftDef?.shift_name || null
  }

  async function fetchGuards() {
    const { data: guards, error: guardsError } = await supabase
      .from('users')
      .select('id, full_name, external_employee_code, external_role')
      .eq('is_active', true)
      .in('external_role', ['SECURITY OFFICER', 'NEPALESE SECURITY OFFICER'])

    if (guardsError) throw guardsError

    const guardsList = (guards || []).map((g: any) => ({
      id: g.id,
      full_name: g.full_name,
      external_employee_code: g.external_employee_code,
      status: 'available',
    }))

    setGuardsDirectory(guardsList)
  }

  async function saveAssignment() {
    if (!selectedSlot || !selectedGuard || !siteUUID) return

    try {
      // Find the full slot data from the slotsRef using selectedSlot.id
      const fullSlot = slotsRef.current.find(s => s.id === selectedSlot.id)

      if (!fullSlot) {
        alert('Could not find slot data')
        return
      }

      // Check if this guard already has a non-cancelled assignment for this exact slot
      const { data: existingAssignment } = await supabase
        .from('shift_assignments')
        .select('id')
        .eq('roster_slot_id', fullSlot.id)
        .eq('guard_id', selectedGuard.id)
        .eq('is_cancelled', false)
        .single()

      if (existingAssignment) {
        // Guard already assigned to this slot - nothing to do
        alert('This guard is already assigned to this slot.')
        setSelectedGuard(null)
        setSearchQuery('')
        return
      }

      // Check if this guard has any overlapping assignment at this time (different slot)
      const { data: overlappingAssignment } = await supabase
        .from('shift_assignments')
        .select('id, roster_slots!inner(shift_date, start_time, end_time)')
        .eq('guard_id', selectedGuard.id)
        .eq('is_cancelled', false)
        .eq('roster_slots.shift_date', fullSlot.shift_date)
        .lt('roster_slots.start_time', fullSlot.end_time)
        .gt('roster_slots.end_time', fullSlot.start_time)
        .neq('roster_slot_id', fullSlot.id)
        .limit(1)

      if (overlappingAssignment && overlappingAssignment.length > 0) {
        alert('This guard is already assigned to another shift at this time.')
        return
      }

      const { error } = await supabase.from('shift_assignments').insert({
        roster_slot_id: fullSlot.id,
        site_id: siteUUID,
        guard_id: selectedGuard.id,
        start_time: fullSlot.start_time,
        end_time: fullSlot.end_time,
        assignment_type: 'planned',
        reason: null,
        is_cancelled: false,
      })

      if (error) {
        console.error('[v0] Save error:', error)
        alert(parseTriggerError(error.message))
        return
      }

      setSelectedGuard(null)
      setSearchQuery('')
      await fetchSchedule(siteUUID)
    } catch (err) {
      console.error('[v0] Error saving assignment:', err)
      alert('Failed to save assignment')
    }
  }

  async function cancelAssignment(assignmentId: string) {
    try {
      const { error } = await supabase
        .from('shift_assignments')
        .update({ is_cancelled: true })
        .eq('id', assignmentId)

      if (error) throw error
      if (siteUUID) {
        await fetchSchedule(siteUUID)
      }
    } catch (err) {
      console.error('[v0] Error cancelling assignment:', err)
      alert('Failed to cancel assignment')
    }
  }

  function getSlotForCell(shiftIndex: number, dayIndex: number) {
    const targetShiftCode = shifts[shiftIndex]?.code
    const slot = slotsRef.current.find(s => {
      const slotDate = new Date(s.shift_date)
      const dayIndex_slot = (slotDate.getDay() + 6) % 7
      const shiftDef = shiftDefs.find(sd => sd.id === s.shift_definition_id)
      // Match using startsWith since DB has 'MRN-01' and we have 'MRN'
      return dayIndex_slot === dayIndex && shiftDef?.shift_code?.startsWith(targetShiftCode)
    })
    return slot || null
  }

  function parseTriggerError(message: string): string {
    if (message.includes('Headcount exceeded')) return 'This slot is already full.'
    if (message.includes('Guard is on approved leave')) return 'This guard is on approved leave on that date.'
    if (message.includes('Invalid assignment')) return 'The assignment falls outside the slot time window.'
    if (message.includes('no_double_booking') || message.includes('No double booking')) return 'This guard is already assigned to another shift at this time.'
    if (message.includes('adhoc_validation')) return 'Ad-hoc assignments require a reason.'
    return message
  }

  function buildRosterGrid() {
    // Initialize grid: 3 shifts × 7 days
    const grid: any[][][] = [
      Array(7).fill(null).map(() => []),
      Array(7).fill(null).map(() => []),
      Array(7).fill(null).map(() => []),
    ]

    // Build lookup maps
    const slotMap = new Map(slots.map(s => [s.id, s]))
    const shiftDefMap = new Map(shiftDefs.map(s => [s.id, s]))
    const guardMap = new Map(guardNames.map(g => [g.id, g]))

    // Place assignments in grid
    assignments.forEach((assignment: any) => {
      const slot = slotMap.get(assignment.roster_slot_id)
      if (!slot) {
        return
      }

      const shiftDef = shiftDefMap.get(slot.shift_definition_id)
      if (!shiftDef) {
        return
      }

      const guard = guardMap.get(assignment.guard_id)
      if (!guard) {
        return
      }

      const shiftDate = new Date(slot.shift_date)
      const dayIndex = (shiftDate.getDay() + 6) % 7 // Convert Sunday=0 to Monday=0
      
      // Match shift by checking if the database shift_code starts with our prefix
      // DB has 'MRN-01', we have 'MRN' - use startsWith for matching
      const shiftIndex = shifts.findIndex(s => shiftDef.shift_code.startsWith(s.code))

      if (shiftIndex >= 0 && dayIndex >= 0 && dayIndex < 7) {
        grid[shiftIndex][dayIndex].push([
          guard.full_name,
          assignment.assignment_type.toLowerCase(),
          assignment.id,
        ])
      }
    })

    return grid
  }

  function getRosterCell(shiftIndex: number, dayIndex: number) {
    const grid = buildRosterGrid()
    return grid?.[shiftIndex]?.[dayIndex] || []
  }

  function getAssignedCount(shiftIndex: number, dayIndex: number) {
    return getRosterCell(shiftIndex, dayIndex).filter((cell) => cell !== null && cell !== undefined).length
  }

  function getRequiredHeadcount(shiftIndex: number): number {
    // Try to get from database shift definitions first
    const targetShiftCode = shifts[shiftIndex]?.code
    const dbShiftDef = shiftDefs.find(sd => sd.shift_code?.startsWith(targetShiftCode))
    if (dbShiftDef?.required_headcount) {
      return dbShiftDef.required_headcount
    }
    // Fallback to hardcoded value
    return shifts[shiftIndex]?.required || 2
  }

  function getRequiredHeadcountForSlot(slotId: string): number {
    // Get required headcount for a specific slot by looking up its shift definition
    const slot = slotsRef.current.find(s => s.id === slotId)
    if (!slot) return 2
    
    const shiftDef = shiftDefs.find(sd => sd.id === slot.shift_definition_id)
    return shiftDef?.required_headcount || 2
  }

  // Calculate coverage percentages based on actual assignments
  function calculateCoverage(): number[] {
    const grid = buildRosterGrid()
    const coverage: number[] = []

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      let totalRequired = 0
      let totalFilled = 0

      for (let shiftIdx = 0; shiftIdx < shifts.length; shiftIdx++) {
        totalRequired += shifts[shiftIdx].required
        totalFilled += grid[shiftIdx][dayIdx].length
      }

      const percentage = totalRequired > 0 ? Math.round((totalFilled / totalRequired) * 100) : 0
      coverage.push(percentage)
    }

    return coverage
  }

  // Get real coverage data
  const realCoverageData = assignments.length > 0 ? calculateCoverage() : coverageData

  function getSelectedCellData() {
    const shiftIndex = selectedCell.shiftIndex
    const dayIndex = selectedCell.dayIndex
    // Get required from the actual slot if available, otherwise use hardcoded
    const required = selectedSlot ? getRequiredHeadcountForSlot(selectedSlot.id) : shifts[shiftIndex].required
    // Count actual assignments from database for the selected slot (more accurate than grid-based count)
    // This ensures we count ALL assignments including those from non-guard users
    const filled = selectedSlot 
      ? assignments.filter(a => a.roster_slot_id === selectedSlot.id).length
      : getAssignedCount(shiftIndex, dayIndex)
    const date = days[dayIndex]
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' })
    return {
      shift: shifts[shiftIndex].name,
      time: shifts[shiftIndex].time,
      date: dateStr,
      filled,
      required,
      dayIndex,
      shiftIndex,
    }
  }

  const filteredGuards = guardsDirectory.filter((g) =>
    g.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function getCoverageColor(percentage: number) {
    if (percentage >= 80) return 'text-green-600'
    if (percentage >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  function getChipColor(status: string | null, shiftCount: number = 1) {
    // For assigned guards, check shift overload count
    if (status) {
      if (shiftCount >= 3) return 'bg-red-100 text-red-700 border-0 font-semibold'
      if (shiftCount === 2) return 'bg-amber-100 text-amber-700 border-0 font-semibold'
      // Otherwise apply normal assignment type colors
      if (status === 'planned') return 'bg-green-100 text-green-700 border-0'
      if (status === 'replacement') return 'bg-amber-100 text-amber-700 border-0'
      if (status === 'adhoc') return 'bg-purple-100 text-purple-700 border-0'
      if (status === 'absent') return 'bg-red-100 text-red-700 border-0 line-through'
    }
    return 'border-2 border-dashed border-slate-300 text-slate-500'
  }

  const dateStr = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })
  const weekRangeLabel = `${weekStart.toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
  })} - ${weekEnd.toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`

  return (
    <>
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">{dateStr}</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">Azri Hamdan</p>
              <Badge variant="secondary" className="mt-1">
                Supervisor
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-slate-600 hover:text-slate-900">
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
          onClick={handleBackToOverview}
          className="text-slate-600 hover:text-slate-900 pl-0"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Overview
        </Button>
      </div>

      {/* Schedule Content */}
      <div className="p-8 flex gap-8">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <p className="text-slate-600">Loading schedule...</p>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center p-8">
            <p className="text-red-600">Error: {error}</p>
          </div>
        )}
        {!loading && !error && (
          <>
            <div className="flex-1">
              {/* Site Pill */}
              <div className="mb-6">
                <Badge className="bg-slate-100 text-slate-700 border-0 px-3 py-1 text-sm">
                  {siteId}
                </Badge>
              </div>

            {/* Week / Day Navigation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {viewMode === 'week' ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => {
                        const prev = new Date(weekStart)
                        prev.setDate(prev.getDate() - 7)
                        setWeekStartDate(prev)
                        setDayViewDate(prev)
                      }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <span className="text-sm font-medium text-slate-900">
                      {weekRangeLabel}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => {
                        const next = new Date(weekStart)
                        next.setDate(next.getDate() + 7)
                        setWeekStartDate(next)
                        setDayViewDate(next)
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => {
                        const prev = new Date(dayViewDate)
                        prev.setDate(prev.getDate() - 1)
                        if (prev >= weekStart) setDayViewDate(prev)
                      }}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <span className="text-sm font-medium text-slate-900">
                      {dayViewDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => {
                        const next = new Date(dayViewDate)
                        next.setDate(next.getDate() + 1)
                        if (next <= weekEnd) setDayViewDate(next)
                      }}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'week' ? 'outline' : 'ghost'}
                  size="sm"
                  className={viewMode === 'week' ? 'text-teal-600 border-teal-200' : 'text-slate-600'}
                  onClick={() => setViewMode('week')}
                >
                  Week
                </Button>
                <Button
                  variant={viewMode === 'day' ? 'outline' : 'ghost'}
                  size="sm"
                  className={viewMode === 'day' ? 'text-teal-600 border-teal-200' : 'text-slate-600'}
                  onClick={() => setViewMode('day')}
                >
                  Day
                </Button>
              </div>
            </div>

            {viewMode === 'week' ? (
              <>
                {/* Coverage Strip */}
                <div className="flex gap-2 mb-6">
                  <div className="w-32 flex-shrink-0"></div>
                  <div className="grid grid-cols-7 gap-2 flex-1">
                    {days.map((day, idx) => {
                      const isToday = getLocalDateString(day) === todayStr
                      const coverage = realCoverageData[idx]
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border ${isToday ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}
                        >
                          <div className="text-xs font-semibold text-slate-700 mb-2">
                            {dayNames[idx]}
                          </div>
                          <div className={`text-lg font-bold ${getCoverageColor(coverage)}`}>{coverage}%</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Roster Grid */}
                <Card className="border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 w-32">Shift</th>
                          {days.map((day, idx) => {
                            const isToday = getLocalDateString(day) === todayStr
                            return (
                              <th
                                key={idx}
                                className={`px-4 py-3 text-center text-xs font-semibold ${isToday ? 'bg-blue-50' : ''} text-slate-700`}
                              >
                                {dayNames[idx]} {day.getDate()}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map((shift, shiftIdx) => (
                          <tr key={shiftIdx} className="border-b border-slate-200">
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                              <div>{shift.name}</div>
                              <div className="text-xs text-slate-600">{shift.time}</div>
                            </td>
                            {days.map((day, dayIdx) => {
                              const isToday = getLocalDateString(day) === todayStr
                              const isSelected = selectedCell.shiftIndex === shiftIdx && selectedCell.dayIndex === dayIdx
                              const targetShiftCode = shifts[shiftIdx]?.code
                              const dayStr = getLocalDateString(day)
                              const slot = slotsRef.current.find(s => {
                                const slotDate = getLocalDateString(new Date(s.shift_date))
                                const shiftDef = shiftDefs.find(sd => sd.id === s.shift_definition_id)
                                return slotDate === dayStr && shiftDef?.shift_code?.startsWith(targetShiftCode)
                              })
                              const cells = getRosterCell(shiftIdx, dayIdx)
                              const required = slot ? getRequiredHeadcountForSlot(slot.id) : getRequiredHeadcount(shiftIdx)
                              const filled = cells.length
                              const unfilled = Math.max(0, required - filled)
                              return (
                                <td
                                  key={dayIdx}
                                  onClick={() => {
                                    setSelectedCell({ shiftIndex: shiftIdx, dayIndex: dayIdx })
                                    setSelectedSlot(slot)
                                  }}
                                  className={`px-4 py-3 text-center cursor-pointer transition ${
                                    isSelected ? 'bg-teal-50 border-2 border-teal-300' : isToday ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  <div className="space-y-1">
                                    {cells.map((cell, cellIdx) => {
                                      const dateStr = getLocalDateString(day)
                                      const guardMap = guardShiftCounts.get(dateStr) || new Map()
                                      const guardId = cell[2] ? assignments.find(a => a.id === cell[2])?.guard_id : null
                                      const shiftCount = guardId ? (guardMap.get(guardId) || 1) : 1
                                      return (
                                        <div key={cellIdx} className={`px-2 py-1 rounded text-xs font-medium ${getChipColor(cell[1], shiftCount)}`}>
                                          {cell[0]}
                                        </div>
                                      )
                                    })}
                                    {Array.from({ length: unfilled }).map((_, idx) => (
                                      <div key={`empty-${idx}`} className={`px-2 py-1 rounded text-xs font-medium ${getChipColor(null)}`}>
                                        + assign
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            ) : (
              /* Day View */
              <div className="space-y-3">
                {shifts.map((shift, shiftIdx) => {
                  const dayStr = getLocalDateString(dayViewDate)
                  const dayIdx = days.findIndex(d => getLocalDateString(d) === dayStr)
                  const targetShiftCode = shift.code
                  const slot = slotsRef.current.find(s => {
                    const slotDate = getLocalDateString(new Date(s.shift_date))
                    const shiftDef = shiftDefs.find(sd => sd.id === s.shift_definition_id)
                    return slotDate === dayStr && shiftDef?.shift_code?.startsWith(targetShiftCode)
                  })
                  const cells = dayIdx >= 0 ? getRosterCell(shiftIdx, dayIdx) : []
                  const required = slot ? getRequiredHeadcountForSlot(slot.id) : shift.required
                  const filled = cells.length
                  const unfilled = Math.max(0, required - filled)
                  const isSelected = selectedCell.shiftIndex === shiftIdx && selectedCell.dayIndex === dayIdx

                  return (
                    <Card
                      key={shiftIdx}
                      onClick={() => {
                        if (dayIdx >= 0) {
                          setSelectedCell({ shiftIndex: shiftIdx, dayIndex: dayIdx })
                          setSelectedSlot(slot)
                        }
                      }}
                      className={`border-slate-200 p-4 cursor-pointer transition ${isSelected ? 'border-teal-300 bg-teal-50' : ''}`}
                    >
                      <div className="flex items-start gap-6">
                        {/* Shift label */}
                        <div className="w-36 flex-shrink-0">
                          <div className="text-sm font-semibold text-slate-900">{shift.name}</div>
                          <div className="text-xs text-slate-500">{shift.time}</div>
                        </div>

                        {/* Chips */}
                        <div className="flex flex-wrap gap-2 flex-1">
                          {cells.map((cell, cellIdx) => {
                            const guardMap = guardShiftCounts.get(dayStr) || new Map()
                            const guardId = cell[2] ? assignments.find(a => a.id === cell[2])?.guard_id : null
                            const shiftCount = guardId ? (guardMap.get(guardId) || 1) : 1
                            return (
                              <div key={cellIdx} className={`px-2 py-1 rounded text-xs font-medium ${getChipColor(cell[1], shiftCount)}`}>
                                {cell[0]}
                              </div>
                            )
                          })}
                          {Array.from({ length: unfilled }).map((_, idx) => (
                            <div key={`empty-${idx}`} className={`px-2 py-1 rounded text-xs font-medium ${getChipColor(null)}`}>
                              + assign
                            </div>
                          ))}
                        </div>

                        {/* Headcount bar */}
                        <div className="w-28 flex-shrink-0">
                          <div className="text-xs text-slate-600 mb-1 text-right">{filled} of {required}</div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-[width,background-color] ${filled >= required ? 'bg-green-500' : filled > 0 ? 'bg-amber-400' : 'bg-slate-300'}`}
                              style={{ width: `${required > 0 ? Math.min(100, (filled / required) * 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* Legend & Warning */}
            <div>
              {/* Warning Note */}
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                <strong>Shift Overload Warning:</strong> Guards highlighted in <strong>amber</strong> are assigned to 2 shifts today. Guards in <strong>red</strong> are assigned to 3+ shifts - please review.
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-100 border border-green-200"></div>
                  <span>Green = Planned (1 shift)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-amber-100 border border-amber-200"></div>
                  <span>Amber = Double shift (2 shifts)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-100 border border-red-200"></div>
                  <span>Red = Triple shift (3+ shifts)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded border-2 border-dashed border-slate-300"></div>
                  <span>Dashed = Unassigned slot</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="w-72 flex-shrink-0">
            <Card className="border-slate-200 p-6 sticky top-8">
              {(() => {
                const cellData = getSelectedCellData()
                const assignedGuards = getRosterCell(cellData.shiftIndex, cellData.dayIndex)
                return (
                  <>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                      {cellData.shift} - {cellData.date}
                    </h3>
                    <div className="text-sm text-slate-600 mb-4">
                      {cellData.time} / {siteId} / {cellData.filled} of {cellData.required} filled
                    </div>

                    {/* Headcount Bar */}
                    <div className="mb-4">
                      <div className="w-full bg-slate-200 rounded h-2">
                        <div
                          className="bg-teal-600 h-2 rounded transition-[width]"
                          style={{ width: `${(cellData.filled / cellData.required) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Assigned Section */}
                    <div className="mb-6 pb-6 border-b border-slate-200">
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Assigned</h4>
                      <div className="space-y-2">
                        {assignedGuards.map(
                          (cell, idx) =>
                            cell && (
                              <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                                <div>
                                  <div className="text-sm font-medium text-slate-900">{cell[0]}</div>
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs mt-1 ${
                                      cell[1] === 'planned' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                    }`}
                                  >
                                    {cell[1]}
                                  </Badge>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => cancelAssignment(cell[2])}
                                  className="text-slate-600 hover:text-red-600"
                                  aria-label={`Cancel assignment for ${cell[0]}`}
                                >
                                  x
                                </Button>
                              </div>
                            )
                        )}
                      </div>
                    </div>

                    {/* Add Guard Section */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Add guard</h4>

                      {/* Search Input */}
                      <Input
                        type="text"
                        placeholder="Search guards..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="mb-4 text-sm"
                      />

                      {/* Guard List */}
                      <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                        {filteredGuards
                          .filter(guard => {
                            // Hide guards already assigned to THIS slot
                            const isAlreadyAssignedToThisSlot = selectedSlot && assignments.some(
                              a => a.guard_id === guard.id && a.roster_slot_id === selectedSlot.id
                            )
                            return !isAlreadyAssignedToThisSlot
                          })
                          .map((guard) => {
                            const dateStr = selectedSlot ? getLocalDateString(new Date(selectedSlot.shift_date)) : null
                            
                            // Check if guard is on approved leave on this date
                            const isOnLeave = dateStr && guardLeave.some(leave => {
                              const leaveStart = getLocalDateString(new Date(leave.leave_start_date))
                              const leaveEnd = getLocalDateString(new Date(leave.leave_end_date))
                              return guard.id === leave.guard_id && dateStr >= leaveStart && dateStr <= leaveEnd
                            })
                            
                            // Check if guard is assigned to a DIFFERENT slot today
                            const assignmentOnOtherSlotToday = dateStr && assignments.find(a => {
                              const slotDate = slotsRef.current.find(s => s.id === a.roster_slot_id)?.shift_date
                              const assignmentDateStr = slotDate ? getLocalDateString(new Date(slotDate)) : null
                              return a.guard_id === guard.id && 
                                     assignmentDateStr === dateStr && 
                                     a.roster_slot_id !== selectedSlot?.id
                            })
                            
                            const shiftNameForBadge = assignmentOnOtherSlotToday ? getShiftNameForAssignment(assignmentOnOtherSlotToday.id) : null
                            
                            const isDisabled = isOnLeave
                            const isSelected = selectedGuard?.id === guard.id
                            return (
                              <button
                                key={guard.id}
                                onClick={() => !isDisabled && setSelectedGuard(guard)}
                                disabled={isDisabled}
                                className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition ${
                                  isDisabled
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : isSelected
                                      ? 'bg-teal-50 text-teal-700 border-2 border-teal-300'
                                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span>{guard.full_name}</span>
                                  <div className="flex items-center gap-2">
                                    {shiftNameForBadge && !isDisabled && (
                                      <Badge className="bg-teal-500 text-white text-xs">
                                        Assigned: {shiftNameForBadge}
                                      </Badge>
                                    )}
                                    {isOnLeave && (
                                      <span className="text-xs text-red-600">(on leave)</span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                      </div>

                        {/* Save Button */}
                        {cellData.filled >= cellData.required ? (
                          <div className="text-center text-sm text-amber-600 font-medium py-2 bg-amber-50 rounded">
                            Slot is full ({cellData.filled}/{cellData.required})
                          </div>
                        ) : (
                          <Button
                            onClick={saveAssignment}
                            disabled={!selectedGuard || !selectedSlot}
                            className="w-full bg-teal-600 hover:bg-teal-700"
                            size="sm"
                          >
                            Save
                          </Button>
                        )}
                    </div>
                  </>
                )
              })()}
            </Card>
            </div>
          </>
        )}
      </div>
    </>
  )
}



