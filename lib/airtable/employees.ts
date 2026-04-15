type AirtableFieldValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | null
  | undefined

interface AirtableRecord {
  id: string
  createdTime: string
  fields: Record<string, AirtableFieldValue>
}

interface AirtableListResponse {
  records?: AirtableRecord[]
  offset?: string
  error?: {
    type?: string
    message?: string
  }
}

export class AirtableRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AirtableRequestError'
  }
}

export interface AirtableEmployee {
  airtableId: string
  employeeCode: string | null
  fullName: string | null
  role: string | null
  mappedRole: 'guard' | 'supervisor' | 'manager' | 'unmapped'
  status: string | null
  isActive: boolean | null
  email: string | null
  phone: string | null
  createdTime: string
  fields: Record<string, AirtableFieldValue>
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function firstString(fields: Record<string, AirtableFieldValue>, keys: string[]) {
  for (const key of keys) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function firstField(fields: Record<string, AirtableFieldValue>, keys: string[]) {
  for (const key of keys) {
    if (fields[key] !== undefined) return fields[key]
  }
  return undefined
}

function toTerminatedStatus(value: AirtableFieldValue) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  const normalized = value.trim().toLowerCase()
  if (['terminated', 'inactive', 'resigned', 'yes', 'true', '1'].includes(normalized)) return true
  return false
}

function airtableErrorMessage(payload: AirtableListResponse, status: number) {
  const type = payload.error?.type
  const message = payload.error?.message || `Airtable request failed with ${status}`

  if (
    type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND' ||
    message.toLowerCase().includes('invalid permissions')
  ) {
    return [
      'Airtable cannot read the configured employee table.',
      'Check that AIRTABLE_API_KEY is a Personal Access Token with data.records:read,',
      'that the token has access to AIRTABLE_BASE_ID,',
      'and that AIRTABLE_EMPLOYEES_TABLE_ID or AIRTABLE_EMPLOYEES_TABLE matches the employee table exactly.',
    ].join(' ')
  }

  return message
}

export function mapAirtableEmployeeRole(role: string | null | undefined): AirtableEmployee['mappedRole'] {
  const normalized = role?.trim().toUpperCase()

  if (!normalized) return 'unmapped'
  if (['SECURITY OFFICER', 'NEPALESE SECURITY OFFICER'].includes(normalized)) return 'guard'
  if (normalized === 'OPERATIONS EXECUTIVE') return 'supervisor'
  if (['HR & ADMIN EXECUTIVE', 'MANAGER', 'EXECUTIVE DIRECTOR'].includes(normalized)) return 'manager'

  return 'unmapped'
}

function normalizeEmployee(record: AirtableRecord): AirtableEmployee {
  const fields = record.fields
  const isTerminated = toTerminatedStatus(firstField(fields, ['Emp Termination', 'Employee Termination', 'Termination']))
  const role = firstString(fields, ['Role', 'Designation', 'Position', 'Job Title', 'external_role'])

  return {
    airtableId: record.id,
    employeeCode: firstString(fields, [
      'Employee Code',
      'Employee ID',
      'Emp Code',
      'Staff ID',
      'Code',
      'external_employee_code',
    ]),
    fullName: firstString(fields, ['Full Name', 'Employee Name', 'Name', 'full_name']),
    role,
    mappedRole: mapAirtableEmployeeRole(role),
    status: isTerminated ? 'Terminated' : 'Active',
    isActive: !isTerminated,
    email: firstString(fields, ['Emp Email ID', 'Email', 'Work Email', 'email']),
    phone: firstString(fields, ['Local Mobile', 'Phone', 'Mobile', 'Contact Number', 'phone']),
    createdTime: record.createdTime,
    fields,
  }
}

export async function fetchAllAirtableEmployees() {
  const token = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN
  if (!token) throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_TOKEN')

  const baseId = requiredEnv('AIRTABLE_BASE_ID')
  const tableIdentifier = process.env.AIRTABLE_EMPLOYEES_TABLE_ID || process.env.AIRTABLE_EMPLOYEES_TABLE || 'Employees'
  const view = process.env.AIRTABLE_EMPLOYEES_VIEW
  const fields = process.env.AIRTABLE_EMPLOYEES_FIELDS
    ?.split(',')
    .map((field) => field.trim())
    .filter(Boolean)
  if (fields && !fields.includes('Emp Termination')) fields.push('Emp Termination')
  if (fields && !fields.includes('Emp Email ID')) fields.push('Emp Email ID')
  if (fields && !fields.includes('Local Mobile')) fields.push('Local Mobile')

  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableIdentifier)}`)
    url.searchParams.set('pageSize', '100')
    if (offset) url.searchParams.set('offset', offset)
    if (view) url.searchParams.set('view', view)
    fields?.forEach((field) => url.searchParams.append('fields[]', field))

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    const payload = (await response.json()) as AirtableListResponse

    if (!response.ok) {
      throw new AirtableRequestError(airtableErrorMessage(payload, response.status), response.status)
    }

    records.push(...(payload.records || []))
    offset = payload.offset
  } while (offset)

  return records.map(normalizeEmployee)
}
