"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    setDevVerifyUrl(null);

    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (response.ok) {
      const data: { devVerifyUrl?: string } = await response.json();
      setDevVerifyUrl(data.devVerifyUrl ?? null);
      setStatus("sent");
      return;
    }

    const data: { error?: { message?: string } } | null = await response
      .json()
      .catch(() => null);
    setErrorMessage(data?.error?.message ?? "發生錯誤，請稍後再試。");
    setStatus("error");
  }

  if (status === "sent") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p>登入連結已寄出，請check你的信箱（15 分鐘內有效）。</p>
        {devVerifyUrl && (
          <p className="rounded border border-yellow-500 bg-yellow-50 p-3 text-sm">
            [開發環境專用]{" "}
            <a href={devVerifyUrl} className="underline">
              點此快速登入
            </a>
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-center text-xl font-semibold">登入 EventCast</h1>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {status === "loading" ? "寄送中…" : "寄送登入連結"}
        </button>
        {status === "error" && <p className="text-red-600">{errorMessage}</p>}
      </form>
    </main>
  );
}
