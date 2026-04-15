'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LogOut, Plus, Edit2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function ShiftsPage() {
  const router = useRouter()
  const [selectedSiteCode, setSelectedSiteCode] = useState('KLSNT01')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingShift, setEditingShift] = useState<any>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)
  const [siteShifts, setSiteShifts] = useState<Record<string, any[]>>({})
  const [formValues, setFormValues] = useState<any>({})

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const sites = [
    { code: 'KLSNT01', name: 'Sentral Tower', shiftCount: 3 },
    { code: 'PJAYA02', name: 'Damansara Heights', shiftCount: 2 },
    { code: 'SUBNG05', name: 'Subang Parade', shiftCount: 2 },
    { code: 'SETIA08', name: 'Setia Alam', shiftCount: 0 },
    { code: 'AMPNG03', name: 'Ampang Point', shiftCount: 3 },
    { code: 'MONT11', name: 'Mont Kiara', shiftCount: 2 },
  ]

  const shifts: Record<string, any[]> = {
    KLSNT01: [
      {
        id: 1,
        name: 'Morning',
        code: 'MRN-01',
        startTime: '06:00',
        endTime: '14:00',
        headcount: 3,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        startDate: '01 Jan 2026',
        endDate: '31 Dec 2026',
        type: 'Contract',
        isActive: true,
      },
      {
        id: 2,
        name: 'Afternoon',
        code: 'AFT-01',
        startTime: '14:00',
        endTime: '22:00',
        headcount: 2,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        startDate: '01 Jan 2026',
        endDate: '31 Dec 2026',
        type: 'Contract',
        isActive: true,
      },
      {
        id: 3,
        name: 'Night',
        code: 'NGT-01',
        startTime: '22:00',
        endTime: '06:00',
        headcount: 2,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        startDate: '01 Jan 2026',
        endDate: '31 Dec 2026',
        type: 'Contract',
        isActive: true,
      },
    ],
    PJAYA02: [
      {
        id: 4,
        name: 'Morning',
        code: 'MRN-02',
        startTime: '07:00',
        endTime: '15:00',
        headcount: 2,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        startDate: '01 Jan 2026',
        endDate: '31 Dec 2026',
        type: 'Training',
        isActive: true,
      },
      {
        id: 5,
        name: 'Evening',
        code: 'EVN-02',
        startTime: '15:00',
        endTime: '23:00',
        headcount: 2,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        startDate: '01 Jan 2026',
        endDate: '31 Dec 2026',
        type: 'Contract',
        isActive: true,
      },
    ],
  }

  const filteredSites = sites.filter((site) =>
    site.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    site.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedSite = sites.find((s) => s.code === selectedSiteCode)
  const selectedShifts = Array.from(
    new Map(
      [...(shifts[selectedSiteCode] || []), ...(siteShifts[selectedSiteCode] || [])].map((shift) => [
        shift.id,
        shift,
      ]),
    ).values(),
  )

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'Contract':
        return 'bg-green-100 text-green-700'
      case 'Training':
        return 'bg-blue-100 text-blue-700'
      case 'Temporary':
        return 'bg-amber-100 text-amber-700'
      case 'Replacement':
        return 'bg-rose-100 text-rose-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const emptyForm = {
    name: '', code: '', startTime: '', endTime: '',
    headcount: 1, days: [] as string[], startDate: '', endDate: '',
    type: 'Contract', isActive: true,
  }

  const handleEditShift = (shift: any) => {
    setIsAddMode(false)
    setEditingShift(shift)
    setFormValues({ ...shift })
    setIsEditModalOpen(true)
  }

  const handleAddShift = () => {
    setIsAddMode(true)
    setEditingShift(null)
    setFormValues({ ...emptyForm })
    setIsEditModalOpen(true)
  }

  const handleFormChange = (field: string, value: any) => {
    setFormValues((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleDayToggle = (day: string) => {
    setFormValues((prev: any) => {
      const days: string[] = prev.days || []
      return {
        ...prev,
        days: days.includes(day) ? days.filter((d: string) => d !== day) : [...days, day],
      }
    })
  }

  const handleSaveShift = () => {
    if (isAddMode) {
      const newShift = {
        ...formValues,
        id: Date.now(),
      }
      setSiteShifts((prev) => ({
        ...prev,
        [selectedSiteCode]: [...(prev[selectedSiteCode] || []), newShift],
      }))
    } else if (editingShift) {
      setSiteShifts((prev) => {
        const existingOverrides = prev[selectedSiteCode] || []
        const nextShift = { ...editingShift, ...formValues }
        const hasOverride = existingOverrides.some((shift) => shift.id === editingShift.id)
        return {
          ...prev,
          [selectedSiteCode]: hasOverride
            ? existingOverrides.map((shift) => (shift.id === editingShift.id ? nextShift : shift))
            : [...existingOverrides, nextShift],
        }
      })
    }
    setIsEditModalOpen(false)
    setEditingShift(null)
    setIsAddMode(false)
  }

  const todayDate = new Date()
  const dateStr = todayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })

  return (
    <>
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">{dateStr}</div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">Vinod Alex Raj</p>
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

      {/* Two-Panel Layout */}
      <div className="flex flex-1 bg-slate-50">
        {/* Left Panel - Site List (40%) */}
        <div className="w-2/5 border-r border-slate-200 bg-white p-6 overflow-y-auto">
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Shift changes on this screen are local to the current session until Supabase persistence is wired.
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-4">Sites</h3>
          <Input
            type="text"
            placeholder="Search sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-4"
          />
          <div className="space-y-2">
            {filteredSites.map((site) => (
              <button
                key={site.code}
                onClick={() => setSelectedSiteCode(site.code)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition ${
                  selectedSiteCode === site.code
                    ? 'bg-teal-50 border-teal-300 text-slate-900'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium">{site.code}</div>
                <div className="text-sm text-slate-600">{site.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {site.shiftCount === 0 ? (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="w-3 h-3" />
                      No active shifts
                    </span>
                  ) : (
                    `${site.shiftCount} shift${site.shiftCount > 1 ? 's' : ''}`
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel - Shift Definitions (60%) */}
        <div className="flex-1 p-8 overflow-y-auto">
          {selectedSite && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {selectedSite.code} — {selectedSite.name}
                  </h2>
                </div>
                <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleAddShift}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add shift
                </Button>
              </div>

              {/* Shifts List */}
              {selectedShifts.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                    <p className="text-slate-600">No active shifts defined for this site</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedShifts.map((shift) => (
                    <Card key={shift.id} className="p-6 border-slate-200">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{shift.name}</h3>
                          <p className="text-sm text-slate-600">Code: {shift.code}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getTypeBadgeColor(shift.type)}>
                            {shift.type}
                          </Badge>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={shift.isActive}
                              className="w-4 h-4 rounded border-slate-300"
                              readOnly
                            />
                            <span className="ml-2 text-sm text-slate-600">
                              {shift.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Time</p>
                          <p className="text-sm text-slate-900">{shift.startTime} – {shift.endTime}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Required Headcount</p>
                          <p className="text-sm text-slate-900">{shift.headcount} guards</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Days</p>
                          <p className="text-sm text-slate-900">{shift.days.join(' ')}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Period</p>
                          <p className="text-sm text-slate-900">{shift.startDate} – {shift.endDate}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditShift(shift)}
                          className="text-teal-600 border-teal-200 hover:bg-teal-50"
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit / Add Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-6">
                {isAddMode ? 'Add new shift' : 'Edit Shift'}
              </h2>

              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Shift Name</label>
                    <Input
                      type="text"
                      value={formValues.name || ''}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      placeholder="e.g. Morning"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Shift Code</label>
                    <Input
                      type="text"
                      value={formValues.code || ''}
                      onChange={(e) => handleFormChange('code', e.target.value)}
                      placeholder="e.g. MRN-01"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Start Time</label>
                    <Input
                      type="time"
                      value={formValues.startTime || ''}
                      onChange={(e) => handleFormChange('startTime', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">End Time</label>
                    <Input
                      type="time"
                      value={formValues.endTime || ''}
                      onChange={(e) => handleFormChange('endTime', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Required Headcount</label>
                  <Input
                    type="number"
                    value={formValues.headcount || 1}
                    onChange={(e) => handleFormChange('headcount', parseInt(e.target.value))}
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Days of Week</label>
                  <div className="flex gap-4 flex-wrap">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <label key={day} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(formValues.days || []).includes(day)}
                          onChange={() => handleDayToggle(day)}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
                    <Input
                      type="text"
                      value={formValues.startDate || ''}
                      onChange={(e) => handleFormChange('startDate', e.target.value)}
                      placeholder="e.g. 01 Jan 2026"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
                    <Input
                      type="text"
                      value={formValues.endDate || ''}
                      onChange={(e) => handleFormChange('endDate', e.target.value)}
                      placeholder="e.g. 31 Dec 2026"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                  <select
                    value={formValues.type || 'Contract'}
                    onChange={(e) => handleFormChange('type', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900"
                  >
                    <option>Contract</option>
                    <option>Training</option>
                    <option>Temporary</option>
                    <option>Replacement</option>
                    <option>Internal</option>
                    <option>Other</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formValues.isChargeable || false}
                    onChange={(e) => handleFormChange('isChargeable', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Is Chargeable</span>
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setIsEditModalOpen(false); setIsAddMode(false) }}
                  className="text-slate-700 border-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveShift}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  Save
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
