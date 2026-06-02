#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SwsdApiError, SwsdClient } from "./client.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "swsd-mcp",
  version: "0.1.0",
});

const client = new SwsdClient();
registerTools(server, client);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = formatError(error);
  console.error(message);
  process.exit(1);
});

function formatError(error: unknown): string {
  if (error instanceof SwsdApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
