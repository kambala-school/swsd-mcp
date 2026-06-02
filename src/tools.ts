import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SwsdClient } from "./client.js";
import {
  getInputSchema,
  idSchema,
  listInputSchema,
  queryParamsSchema,
  updateInputSchema,
  writeInputSchema,
} from "./schemas.js";

type ToolHandlerResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

interface ResourceConfig {
  singular: string;
  plural: string;
  path: string;
  title: string;
  pluralTitle: string;
}

const resources: ResourceConfig[] = [
  { singular: "incident", plural: "incidents", path: "incidents", title: "Incident", pluralTitle: "Incidents" },
  { singular: "user", plural: "users", path: "users", title: "User", pluralTitle: "Users" },
  { singular: "category", plural: "categories", path: "categories", title: "Category", pluralTitle: "Categories" },
  { singular: "site", plural: "sites", path: "sites", title: "Site", pluralTitle: "Sites" },
  { singular: "department", plural: "departments", path: "departments", title: "Department", pluralTitle: "Departments" },
  { singular: "problem", plural: "problems", path: "problems", title: "Problem", pluralTitle: "Problems" },
  { singular: "change", plural: "changes", path: "changes", title: "Change Request", pluralTitle: "Change Requests" },
];

const writeResources = new Set(["incident", "problem", "change"]);

export function registerTools(server: McpServer, client: SwsdClient): void {
  for (const resource of resources) {
    registerReadTools(server, client, resource);

    if (writeResources.has(resource.singular)) {
      registerWriteTools(server, client, resource);
    }
  }

  registerIncidentCommentTools(server, client);
}

function registerReadTools(server: McpServer, client: SwsdClient, resource: ResourceConfig): void {
  server.registerTool(
    `swsd_list_${resource.plural}`,
    {
      title: `List ${resource.pluralTitle}`,
      description: `List SolarWinds Service Desk ${resource.plural}. Pass query fields as raw SWSD query parameters.`,
      inputSchema: listInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query }) => withToolError(() => client.get(`${resource.path}.json`, query), resource.plural),
  );

  server.registerTool(
    `swsd_get_${resource.singular}`,
    {
      title: `Get ${resource.title}`,
      description: `Get one SolarWinds Service Desk ${resource.singular} by id or number.`,
      inputSchema: getInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id }) => withToolError(() => client.get(`${resource.path}/${id}.json`), resource.singular),
  );
}

function registerWriteTools(server: McpServer, client: SwsdClient, resource: ResourceConfig): void {
  server.registerTool(
    `swsd_create_${resource.singular}`,
    {
      title: `Create ${resource.title}`,
      description: `Create a SolarWinds Service Desk ${resource.singular}. The payload is sent as-is, so include the top-level '${resource.singular}' object when required by SWSD.`,
      inputSchema: writeInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ payload, query }) =>
      withToolError(() => client.post(`${resource.path}.json`, payload, query), resource.singular),
  );

  server.registerTool(
    `swsd_update_${resource.singular}`,
    {
      title: `Update ${resource.title}`,
      description: `Update a SolarWinds Service Desk ${resource.singular}. The payload is sent as-is, so include the top-level '${resource.singular}' object when required by SWSD.`,
      inputSchema: updateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ id, payload, query }) =>
      withToolError(() => client.put(`${resource.path}/${id}.json`, payload, query), resource.singular),
  );
}

function registerIncidentCommentTools(server: McpServer, client: SwsdClient): void {
  server.registerTool(
    "swsd_list_incident_comments",
    {
      title: "List Incident Comments",
      description: "List comments for a SolarWinds Service Desk incident.",
      inputSchema: {
        incident_id: idSchema.describe("Incident id or number."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ incident_id }) =>
      withToolError(() => client.get(`incidents/${incident_id}/comments.json`), "comments"),
  );

  server.registerTool(
    "swsd_create_private_incident_comment",
    {
      title: "Create Private Incident Comment",
      description:
        "Create an incident comment that is always private and hidden from the requester/end user. The tool forces comment.is_private to true.",
      inputSchema: {
        incident_id: idSchema.describe("Incident id or number."),
        body: z.string().min(1).describe("Comment body."),
        user_id: idSchema.optional().describe("Optional SWSD user id to attribute the comment to, if your account/API allows it."),
        extra_comment_fields: z
          .record(z.unknown())
          .optional()
          .describe("Optional extra fields merged into comment. is_private is always overwritten to true."),
        query: queryParamsSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ incident_id, body, user_id, extra_comment_fields, query }) => {
      const comment = {
        ...(extra_comment_fields ?? {}),
        body,
        ...(user_id === undefined ? {} : { user_id }),
        is_private: true,
      };

      return withToolError(
        () => client.post(`incidents/${incident_id}/comments.json`, { comment }, query),
        "comment",
      );
    },
  );
}

async function withToolError(key: string, value: Promise<unknown>): Promise<ToolHandlerResult>;
async function withToolError(load: () => Promise<unknown>, key: string): Promise<ToolHandlerResult>;
async function withToolError(
  loadOrKey: (() => Promise<unknown>) | string,
  keyOrValue: string | Promise<unknown>,
): Promise<ToolHandlerResult> {
  const load = typeof loadOrKey === "function" ? loadOrKey : () => keyOrValue as Promise<unknown>;
  const key = typeof loadOrKey === "string" ? loadOrKey : keyOrValue as string;

  try {
    return asToolResult(key, await load());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}

function asToolResult(key: string, value: unknown): ToolHandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: { [key]: value },
  };
}
