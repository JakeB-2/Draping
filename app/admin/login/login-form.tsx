'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type Mode = 'login' | 'reset'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (searchParams.get('error_code') === 'otp_expired') {
      setMode('reset')
      setError('Your reset link has expired. Enter your email to get a new one.')
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setPending(true)

    const supabase = createClient()

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setPending(false)
        return
      }
      router.push('/admin')
      router.refresh()
    } else {
      const redirectTo = `${window.location.origin}/auth/confirm?next=/admin/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      setPending(false)
      if (error) {
        setError(error.message)
        return
      }
      setMessage('Check your email for a password reset link.')
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'reset' : 'login')
    setError(null)
    setMessage(null)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {mode === 'login' && (
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}
      {message && (
        <p className="text-sm text-muted-foreground" role="status">{message}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending
          ? mode === 'login' ? 'Signing in…' : 'Sending…'
          : mode === 'login' ? 'Sign in' : 'Send reset link'}
      </Button>
      <button
        type="button"
        onClick={switchMode}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {mode === 'login' ? 'Forgot password?' : '← Back to sign in'}
      </button>
    </form>
  )
}
