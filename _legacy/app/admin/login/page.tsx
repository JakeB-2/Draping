import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage your bookings.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
