import { getSessionUserId } from "@/lib/serverSession";
import { listPages } from "@/lib/services/page";
import { withPublicUrl } from "@/app/api/pages/shared";
import { PagesPanel } from "./PagesPanel";

export default async function DashboardPagesPage() {
  const userId = await getSessionUserId();
  const pages = userId ? (await listPages(userId)).map(withPublicUrl) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">活動頁</h1>
      <PagesPanel initialPages={pages} />
    </div>
  );
}
