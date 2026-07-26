'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { es } from '@/i18n/es';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    router.push('/ejercicios');
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="py-6">
          <h1 className="text-lg font-semibold">{es.login.title}</h1>
          <p className="mb-5 text-sm text-zinc-500">{es.login.subtitle}</p>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? es.app.loading : es.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
