import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, ClipboardCheck, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME, ROLE_LABEL } from '@/lib/permissions';
import { loginSchema, validate, type FieldErrors } from '@/lib/validation';
import { api, errorMessage } from '@/services';
import { DEMO_LOGINS } from '@/services/demo/demoApi';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';

export function LoginPage() {
  const { profile, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate(loginSchema, { email, password, remember });
    if (v.errors) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      const p = await signIn(v.data.email, v.data.password, v.data.remember);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith(ROLE_HOME[p.role]) ? from : ROLE_HOME[p.role], { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-indigo-50/60 via-surface to-blue-50/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-indigo-600 via-indigo-600 to-blue-500 text-white shadow-xl shadow-indigo-600/25">
            <ClipboardCheck className="size-8 stroke-[2.2]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">تسجيل الدخول · Staff Sign In</h1>
          <p className="mt-1.5 text-sm text-slate-500">للإدارة والمشرفين. يمكن للجميع استعراض ومتابعة المهام بدون حساب.</p>
        </div>

        <form onSubmit={submit} noValidate className="card rounded-3xl border border-slate-200/80 bg-white/95 p-6 sm:p-8 shadow-xl shadow-indigo-950/5 backdrop-blur-md space-y-4">
          {formError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {formError}
            </div>
          )}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="you@example.com"
            autoFocus
          />
          <div className="relative">
            <TextField
              label="Password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute top-[34px] right-2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 rounded border-slate-300 accent-primary" />
            Remember me
          </label>
          <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="size-4" />}>
            Sign in
          </Button>
        </form>

        <Link to="/" className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="size-4" /> View team attendance without signing in
        </Link>

        {api.mode === 'demo' && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm">
            <p className="font-semibold text-amber-900">Demo accounts</p>
            <p className="mb-3 text-xs text-amber-800">Click one to fill the form.</p>
            <div className="grid gap-2">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                  }}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-left hover:border-amber-300"
                >
                  <span>
                    <span className="block text-xs font-semibold text-slate-800">{ROLE_LABEL[d.role]}</span>
                    <span className="text-xs text-slate-500">{d.email}</span>
                  </span>
                  <code className="text-xs text-slate-500">{d.password}</code>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
