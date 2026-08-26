"use client";

import { useState } from "react";
import type { PageStatus } from "@/lib/generated/prisma/enums";
import type { PageSummary } from "@/lib/services/page";

type DashboardPage = PageSummary & { url: string };

const STATUS_LABEL: Record<PageStatus, string> = {
  unlisted: "連結限定",
  public: "完全公開",
  unpublished: "下架",
};

const STATUS_OPTIONS: PageStatus[] = ["unlisted", "public", "unpublished"];

export function PagesPanel({ initialPages }: { initialPages: DashboardPage[] }) {
  const [pages, setPages] = useState(initialPages);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<Record<string, string>>({});

  async function handleStatusChange(id: string, nextStatus: PageStatus) {
    const previousStatus = pages.find((page) => page.id === id)?.status;
    setPendingId(id);
    setErrorMessage((prev) => ({ ...prev, [id]: "" }));
    setPages((prev) => prev.map((page) => (page.id === id ? { ...page, status: nextStatus } : page)));

    const response = await fetch(`/api/dashboard/pages/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    setPendingId(null);

    if (!response.ok) {
      if (previousStatus) {
        setPages((prev) => prev.map((page) => (page.id === id ? { ...page, status: previousStatus } : page)));
      }
      const data: { error?: { message?: string } } | null = await response.json().catch(() => null);
      setErrorMessage((prev) => ({ ...prev, [id]: data?.error?.message ?? "切換失敗，請稍後再試。" }));
    }
  }

  if (pages.length === 0) {
    return <p className="text-sm text-gray-500">尚未建立任何活動頁。</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b">
          <th className="py-2">標題</th>
          <th>日期範圍</th>
          <th>瀏覽次數</th>
          <th>公開網址</th>
          <th>狀態</th>
        </tr>
      </thead>
      <tbody>
        {pages.map((page) => (
          <tr key={page.id} className="border-b align-top">
            <td className="py-2">{page.title}</td>
            <td>
              {new Date(page.dateRangeStart).toLocaleDateString()} –{" "}
              {new Date(page.dateRangeEnd).toLocaleDateString()}
            </td>
            <td>{page.viewCount}</td>
            <td>
              <a href={page.url} target="_blank" rel="noreferrer" className="underline">
                {page.url}
              </a>
            </td>
            <td>
              <select
                value={page.status}
                disabled={pendingId === page.id}
                onChange={(event) => handleStatusChange(page.id, event.target.value as PageStatus)}
                className="rounded border px-2 py-1 disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
              {errorMessage[page.id] && (
                <p className="mt-1 text-xs text-red-600">{errorMessage[page.id]}</p>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
