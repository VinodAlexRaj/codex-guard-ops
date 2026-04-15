'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message || 'Invalid email or password')
        setIsLoading(false)
        return
      }

      if (!data.user) return

      const { data: roleData, error: roleError } = await supabase
        .from('users_with_role')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (roleError) {
        setError('Failed to fetch user role')
        setIsLoading(false)
        return
      }

      router.replace(roleData?.role === 'manager' ? '/manager/overview' : '/supervisor/overview')
    } catch {
      setError('An error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-950 px-4 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.24),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.94))]" />
      <div className="absolute right-[-10rem] top-16 h-80 w-80 rounded-full border border-teal-300/20 bg-teal-300/10 blur-3xl" />
      <main className="relative mx-auto grid w-full max-w-6xl items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="max-w-2xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.28em] text-teal-200">
            Black Gold Security
          </p>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Guard Ops
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
            Command coverage, attendance, and site readiness from one calm operations surface.
          </p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3 text-sm text-slate-300">
            <div className="border-l border-teal-300/50 pl-3">
              <strong className="block text-2xl text-white">24/7</strong>
              Site Coverage
            </div>
            <div className="border-l border-teal-300/50 pl-3">
              <strong className="block text-2xl text-white">Live</strong>
              Attendance
            </div>
            <div className="border-l border-teal-300/50 pl-3">
              <strong className="block text-2xl text-white">Fast</strong>
              Reassignments
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white p-6 text-slate-950 shadow-2xl shadow-black/30 sm:p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold">Sign In</h2>
            <p className="mt-2 text-sm text-slate-600">
              Use your operations account to continue.
            </p>
          </div>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={'Enter password\u2026'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <p aria-live="polite" className="min-h-5 text-sm text-red-600">
                {error}
              </p>
              <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800" disabled={isLoading}>
                {isLoading ? 'Signing In\u2026' : 'Sign In'}
              </Button>
            </FieldGroup>
          </form>
        </section>
      </main>
      <footer className="absolute bottom-5 left-0 right-0 text-center text-sm text-slate-400">
        Black Gold Security &copy; 2026
      </footer>
    </div>
  )
}
