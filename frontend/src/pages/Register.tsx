
import { useState, type FormEvent } from "react";

interface RegisterProps {
  onRegister: (input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }) => Promise<void>;
  onLoginClick: () => void;
}

export default function RegisterPage({
  onRegister,
  onLoginClick,
}: RegisterProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await onRegister({
        name,
        email,
        password,
        organizationName,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Registration failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl"
      >
        <div>
          <h1 className="text-3xl font-bold">Create your account</h1>
          <p className="mt-2 text-sm text-slate-400">
            Get started with LedgerFlow.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm" htmlFor="organizationName">
            Organization name
          </label>
          <input
            id="organizationName"
            required
            minLength={2}
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            placeholder="Your company"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
            placeholder="At least 12 characters"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onLoginClick}
            className="font-semibold text-blue-400 hover:text-blue-300"
          >
            Sign in
          </button>
        </p>
      </form>
    </main>
  );
}
