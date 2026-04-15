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

export interface AirtableEmployee {
  airtableId: string
  employeeCode: string | null
  fullName: string | null
  role: string | null
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

function toActiveStatus(value: AirtableFieldValue) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (['active', 'current', 'yes', 'true', '1'].includes(normalized)) return true
  if (['inactive', 'terminated', 'resigned', 'no', 'false', '0'].includes(normalized)) return false
  return null
}

function normalizeEmployee(record: AirtableRecord): AirtableEmployee {
  const fields = record.fields
  const status = firstString(fields, ['Status', 'Employment Status', 'Employee Status', 'status'])

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
    role: firstString(fields, ['Role', 'Designation', 'Position', 'Job Title', 'external_role']),
    status,
    isActive: toActiveStatus(fields.Active ?? fields.active ?? status),
    email: firstString(fields, ['Email', 'Work Email', 'email']),
    phone: firstString(fields, ['Phone', 'Mobile', 'Contact Number', 'phone']),
    createdTime: record.createdTime,
    fields,
  }
}

export async function fetchAllAirtableEmployees() {
  const token = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN
  if (!token) throw new Error('Missing AIRTABLE_API_KEY or AIRTABLE_TOKEN')

  const baseId = requiredEnv('AIRTABLE_BASE_ID')
  const tableName = process.env.AIRTABLE_EMPLOYEES_TABLE || 'Employees'
  const view = process.env.AIRTABLE_EMPLOYEES_VIEW
  const fields = process.env.AIRTABLE_EMPLOYEES_FIELDS
    ?.split(',')
    .map((field) => field.trim())
    .filter(Boolean)

  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`)
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
      throw new Error(payload.error?.message || `Airtable request failed with ${response.status}`)
    }

    records.push(...(payload.records || []))
    offset = payload.offset
  } while (offset)

  return records.map(normalizeEmployee)
}
