
import { useState, type FormEvent } from "react";
import { Activity, ArrowRight, LockKeyhole, Mail } from "lucide-react";

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegisterClick: () => void;
}

export default function Login({
  onLogin,
  onRegisterClick,
}: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await onLogin(email, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-white">
      <section className="hidden w-1/2 flex-col justify-between bg-[#111827] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-emerald-400 p-2.5 text-[#10251e]">
            <Activity size={23} />
          </span>
          <span className="text-xl font-bold">LedgerFlow</span>
        </div>

        <div className="max-w-lg">
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-emerald-300">
            FINANCIAL OPERATIONS, SIMPLIFIED
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Clarity in every transaction.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-400">
            A structured workspace for managing accounts, maintaining
            balanced ledgers, and keeping financial activity accountable.
          </p>
        </div>

        <p className="text-xs text-slate-500">
          Secure access. Organized finances. Clear records.
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="rounded-xl bg-[#172b25] p-2.5 text-emerald-300">
              <Activity size={22} />
            </span>
            <span className="text-xl font-bold text-slate-900">
              LedgerFlow
            </span>
          </div>

          <p className="text-sm font-medium text-emerald-700">
            Welcome back
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Sign in to your account
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Enter your credentials to access your workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Email address
              </span>
              <span className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
                <Mail size={17} className="text-slate-400" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </span>
              <span className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-600/10">
                <LockKeyhole size={17} className="text-slate-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#172b25] text-sm font-semibold text-white transition hover:bg-[#24483b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            New to LedgerFlow?{" "}
            <button
              type="button"
              onClick={onRegisterClick}
              className="font-semibold text-emerald-700 hover:text-emerald-900"
            >
              Create an account
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
