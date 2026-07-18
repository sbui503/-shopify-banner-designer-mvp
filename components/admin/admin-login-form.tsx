"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AdminLoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
          nextPath
        })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Sign in failed.");
        return;
      }
      router.replace(result.nextPath || "/admin");
      router.refresh();
    } catch {
      setError("Sign in failed. Check the connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-800" htmlFor="admin-username">Username</label>
        <input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="h-11 w-full rounded-md border bg-white px-3 text-base outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-800" htmlFor="admin-password">Password</label>
        <div className="relative">
          <input
            id="admin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-11 w-full rounded-md border bg-white px-3 pr-11 text-base outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-900"
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm font-semibold text-red-700" role="alert">{error}</p> : null}

      <Button type="submit" className="h-11 w-full gap-2" disabled={submitting}>
        <LogIn className="h-4 w-4" />
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
