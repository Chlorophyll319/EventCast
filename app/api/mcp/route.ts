import { NextResponse } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ApiTokenScope } from "@/lib/generated/prisma/enums";
import { findMcpTool, mapErrorToMcpContent, MCP_TOOLS } from "@/lib/services/mcpTools";
import { authenticate } from "../pages/shared";

// 非 tools/call 的 method（initialize／tools/list 等）只需要驗證 token 有效，用最低的 read 需求；
// 無法辨識 body 形狀（含 JSON-RPC batch 陣列，本 MVP 不支援）時，保守地要求 write。
function resolveRequiredScope(body: unknown): ApiTokenScope {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "write";
  }
  const message = body as { method?: unknown; params?: { name?: unknown } };
  if (message.method !== "tools/call") {
    return "read";
  }
  const toolName = message.params?.name;
  if (typeof toolName !== "string") {
    return "write";
  }
  return findMcpTool(toolName)?.requiredScope ?? "write";
}

function buildServer(userId: string): McpServer {
  const server = new McpServer({ name: "eventcast", version: "1.0.0" });
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args) => {
        try {
          const result = await tool.execute(userId, args as Record<string, unknown>);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
          };
        } catch (error) {
          return mapErrorToMcpContent(error);
        }
      },
    );
  }
  return server;
}

export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be JSON." } },
      { status: 422 },
    );
  }

  const auth = await authenticate(request, resolveRequiredScope(parsedBody));
  if (auth instanceof NextResponse) {
    return auth;
  }

  // Stateless：每個 request 建立獨立的 server/transport，不維持 session，
  // 因為每個 tool call 都已在上方完成本次請求的驗證/scope/rate limit。
  // enableJsonResponse：所有 tool 都是同步 request/response，不需要 SSE 推播；
  // 若改用預設的 SSE 模式，handleRequest() 會在串流「開始」時就 resolve（body 尚未寫完），
  // 下方 finally 一旦立刻 close() 會提早切斷串流、回應變成空 body（已用手動測試驗證此問題）。
  const server = buildServer(auth.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request, { parsedBody });
  } finally {
    await transport.close();
    await server.close();
  }
}
