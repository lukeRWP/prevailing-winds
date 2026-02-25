'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Prevailing Winds
          </h1>
          <p className="text-sm text-muted-foreground">
            Infrastructure Management Dashboard
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">
            {error === 'AccessDenied'
              ? 'Your account is not authorized. Contact your administrator.'
              : 'Authentication failed. Please try again.'}
          </p>
        )}

        <button
          onClick={() => signIn('microsoft-entra-id', { callbackUrl: '/' })}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
