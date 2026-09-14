"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nProvider";

export function LoginPage() {
  const { login, session } = useAuth();
  const { t, dir } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("super@touri.local");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4" dir={dir}>
      <form
        data-testid="login-form"
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 text-slate-100 shadow-xl"
      >
        <h1 className="text-2xl font-semibold">{t("appName")}</h1>
        <p className="mt-2 text-sm text-slate-400">
          Mock auth — password for all users: <code>password</code>
        </p>
        <label className="mt-6 block text-sm">
          {t("email")}
          <input
            data-testid="login-email"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label className="mt-4 block text-sm">
          {t("password")}
          <input
            data-testid="login-password"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {error || session.errorMessage ? (
          <p data-testid="login-error" className="mt-3 text-sm text-red-400">
            {error ?? session.errorMessage}
          </p>
        ) : null}
        <button
          data-testid="login-submit"
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {submitting ? t("loading") : t("login")}
        </button>
      </form>
    </div>
  );
}
