"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { posDb } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    // The same account as the POS. Nobody is created here.
    const { error: err } = await posDb.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    router.replace("/");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form
        onSubmit={signIn}
        className="bg-white border border-slate-200 rounded-2xl p-8 w-full max-w-sm shadow-sm"
      >
        <h1 className="text-xl font-semibold mb-1">Daily Reports</h1>
        <p className="text-sm text-slate-500 mb-6">နေ့စဉ် အစီရင်ခံစာ</p>

        <label className="text-sm text-slate-600">Email</label>
        <input
          type="email"
          required
          autoFocus
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="text-sm text-slate-600">Password</label>
        <input
          type="password"
          required
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 bg-blue-600 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold"
        >
          {busy ? "…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
