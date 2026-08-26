"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyConfirmButton({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConfirm() {
    setStatus("loading");
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      router.push("/dashboard");
      return;
    }

    const data: { error?: { message?: string } } | null = await response
      .json()
      .catch(() => null);
    setErrorMessage(data?.error?.message ?? "登入連結無效或已過期。");
    setStatus("error");
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={status === "loading"}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {status === "loading" ? "登入中…" : "確認登入"}
      </button>
      {status === "error" && <p className="text-red-600">{errorMessage}</p>}
    </div>
  );
}
