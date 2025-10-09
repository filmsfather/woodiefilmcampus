import { AuthForm } from '@/components/auth/AuthForm'
import { redirectAuthenticatedUser } from '@/lib/auth'

export default async function LoginPage() {
  await redirectAuthenticatedUser()

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-primary/15 via-background to-secondary/10 px-6 py-12">
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-border bg-card/80 p-8 shadow">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold text-primary">WOODIE CAMPUS 2.0</h1>
          <p className="text-muted-foreground">Access your creative campus hub</p>
        </div>
        <AuthForm />
      </div>
    </div>
  )
}
