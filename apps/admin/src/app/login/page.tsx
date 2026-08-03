'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { es } from '@/i18n/es';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { MonoLabel } from '@/components/ui/mono-label';

// Prefill the local admin creds while developing so testing is one click.
const DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEV ? 'admin@dmtx.local' : '');
  const [password, setPassword] = useState(DEV ? 'dmtxadmin' : '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(es.login.error);
      return;
    }
    router.push('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-sm">
        <div className="px-7 py-8">
          <div className="mb-6 flex items-center gap-2.5">
            <Logo />
            <MonoLabel className="text-[11px] tracking-[0.12em] text-muted">Admin</MonoLabel>
          </div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]">{es.login.title}</h1>
          <p className="mb-6 mt-1 text-sm text-ink-3">{es.login.subtitle}</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">{es.login.email}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="password">{es.login.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-accent-dark">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? es.app.loading : es.login.submit}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
