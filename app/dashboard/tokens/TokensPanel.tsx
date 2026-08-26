"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { ApiTokenSummary } from "@/lib/services/apiToken";

type Scope = "read" | "write";

export function TokensPanel({ initialTokens }: { initialTokens: ApiTokenSummary[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [scope, setScope] = useState<Scope>("read");
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage("");
    setNewToken(null);

    const response = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, label: label || undefined }),
    });

    setCreating(false);

    if (!response.ok) {
      const data: { error?: { message?: string } } | null = await response
        .json()
        .catch(() => null);
      setErrorMessage(data?.error?.message ?? "建立失敗，請稍後再試。");
      return;
    }

    const created = await response.json();
    setNewToken(created.token);
    setTokens((prev) => [
      {
        id: created.id,
        tokenPrefix: created.tokenPrefix,
        scope: created.scope,
        label: created.label,
        createdAt: new Date(created.createdAt),
        lastUsedAt: null,
        revokedAt: null,
      },
      ...prev,
    ]);
    setLabel("");
  }

  async function handleRevoke(id: string) {
    const response = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (!response.ok) {
      return;
    }
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, revokedAt: new Date() } : t)));
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Scope
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
            className="rounded border px-2 py-1"
          >
            <option value="read">read</option>
            <option value="write">write</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Label（選填）
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="rounded border px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {creating ? "建立中…" : "建立 Token"}
        </button>
      </form>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {newToken && (
        <div className="rounded border border-yellow-500 bg-yellow-50 p-3 text-sm">
          <p className="font-medium">請立刻複製，這組 Token 只會顯示這一次：</p>
          <code className="break-all">{newToken}</code>
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Token</th>
            <th>Scope</th>
            <th>Label</th>
            <th>建立時間</th>
            <th>狀態</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.id} className="border-b">
              <td className="py-2 font-mono">{token.tokenPrefix}…</td>
              <td>{token.scope}</td>
              <td>{token.label ?? "-"}</td>
              <td>{new Date(token.createdAt).toLocaleString()}</td>
              <td>{token.revokedAt ? "已撤銷" : "有效"}</td>
              <td>
                {!token.revokedAt && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(token.id)}
                    className="text-red-600 underline"
                  >
                    撤銷
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
