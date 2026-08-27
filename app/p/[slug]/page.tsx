import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { TagColor } from "@/lib/generated/prisma/enums";
import type { PageDetail } from "@/lib/services/page";
import { getPageBySlug, incrementPageViewCount } from "@/lib/services/page";
import { buildMetaDescription, formatDateRange, formatEventTime, groupEventsByDay, resolveRobots } from "./format";

// viewCount 每次渲染都要遞增，公開頁不可被靜態化/快取。
export const dynamic = "force-dynamic";

// generateMetadata 與頁面本體都需要依 slug 查詢，React cache() 讓同一次 request 只打一次 DB。
const getCachedPageBySlug = cache(getPageBySlug);

const TAG_COLOR_CLASS: Record<TagColor, string> = {
  red: "bg-red-100 text-red-800",
  orange: "bg-orange-100 text-orange-800",
  yellow: "bg-yellow-100 text-yellow-800",
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  purple: "bg-purple-100 text-purple-800",
  pink: "bg-pink-100 text-pink-800",
  gray: "bg-gray-100 text-gray-800",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCachedPageBySlug(slug);

  // 查無時不在這裡處理 404，交給頁面本體的 notFound()；此處回傳最小化 fallback 即可。
  if (!page) {
    return { title: "找不到活動頁" };
  }

  const url = `${process.env.APP_BASE_URL}/p/${page.slug}`;

  if (page.status === "unpublished") {
    // 下架頁不洩漏原活動內容，meta 只用「已下架」類文字。
    const title = "此活動已下架";
    const description = "這個活動頁目前已下架。";
    return {
      title,
      description,
      robots: resolveRobots(page.status),
      openGraph: { title, description, url },
    };
  }

  const description = buildMetaDescription(page.title, page.dateRangeStart, page.dateRangeEnd);
  return {
    title: page.title,
    description,
    robots: resolveRobots(page.status),
    openGraph: { title: page.title, description, url },
  };
}

export default async function PublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getCachedPageBySlug(slug);

  if (!page) {
    notFound();
  }

  if (page.status === "unpublished") {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">此活動已下架</h1>
        <p className="text-gray-600">這個活動頁目前已下架，若有疑問請聯繫主辦人。</p>
      </main>
    );
  }

  // 僅在確定要渲染活動內容時才遞增，不可在 generateMetadata 或其他分支觸發。
  await incrementPageViewCount(page.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{page.title}</h1>
        <p className="text-gray-600">{formatDateRange(page.dateRangeStart, page.dateRangeEnd, page.timezone)}</p>
      </header>
      {page.template === "lineup" ? (
        <LineupView events={page.events} tags={page.tags} timezone={page.timezone} />
      ) : (
        <TimelineView events={page.events} tags={page.tags} timezone={page.timezone} />
      )}
    </main>
  );
}

type EventListProps = {
  events: PageDetail["events"];
  tags: PageDetail["tags"];
  timezone: string;
};

function TimelineView({ events, tags, timezone }: EventListProps) {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => {
        const tag = event.tagId ? tagById.get(event.tagId) : undefined;
        const time = formatEventTime(event.startTime, event.endTime, timezone);
        return (
          <li key={event.id}>
            <article className="rounded border p-4">
              <div className="flex items-center justify-between gap-2">
                <time dateTime={time.startIso} className="text-sm text-gray-500">
                  {time.display}
                </time>
                {tag && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TAG_COLOR_CLASS[tag.color]}`}>
                    {tag.label}
                  </span>
                )}
              </div>
              <h2 className="mt-1 font-medium">{event.name}</h2>
              {event.location && <p className="text-sm text-gray-600">{event.location}</p>}
              {event.note && <p className="mt-1 text-sm text-gray-500">{event.note}</p>}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function LineupView({ events, tags, timezone }: EventListProps) {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const dayGroups = groupEventsByDay(events, timezone);

  return (
    <div className="flex flex-col gap-6">
      {dayGroups.map((group) => (
        <section key={group.dayLabel} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500">{group.dayLabel}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.events.map((event) => {
              const tag = event.tagId ? tagById.get(event.tagId) : undefined;
              const time = formatEventTime(event.startTime, event.endTime, timezone);
              return (
                <article key={event.id} className="flex flex-col gap-1 rounded border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <time dateTime={time.startIso} className="text-sm text-gray-500">
                      {time.timeOnly}
                    </time>
                    {tag && (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${TAG_COLOR_CLASS[tag.color]}`}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium">{event.name}</h3>
                  {event.location && <p className="text-sm text-gray-600">{event.location}</p>}
                  {event.note && <p className="mt-1 text-sm text-gray-500">{event.note}</p>}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
