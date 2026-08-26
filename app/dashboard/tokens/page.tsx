import { getSessionUserId } from "@/lib/serverSession";
import { listApiTokens } from "@/lib/services/apiToken";
import { TokensPanel } from "./TokensPanel";

export default async function TokensPage() {
  const userId = await getSessionUserId();
  const tokens = userId ? await listApiTokens(userId) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">API Tokens</h1>
      <TokensPanel initialTokens={tokens} />
    </div>
  );
}
