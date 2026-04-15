import { ManagerShell } from '@/components/manager-shell'
import { requireRole } from '@/lib/auth/require-role'

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole('manager')

  return <ManagerShell>{children}</ManagerShell>
}
