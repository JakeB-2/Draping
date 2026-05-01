import { Suspense } from 'react'
import { LoginForm } from './login-form'

function LoginShell() {
  return (
    <div className="space-y-4">
      <div className="h-10 bg-muted rounded animate-pulse" />
      <div className="h-10 bg-muted rounded animate-pulse" />
      <div className="h-10 bg-muted rounded animate-pulse" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Draping admin
          </p>
          <h1 className="text-2xl font-light">Sign in</h1>
        </div>
        <Suspense fallback={<LoginShell />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
