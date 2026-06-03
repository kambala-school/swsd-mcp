import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { QueryParams } from "./client.js";
import { SwsdClient } from "./client.js";
import {
  getInputSchema,
  idSchema,
  incidentListInputSchema,
  listInputSchema,
  queryParamsSchema,
  updateInputSchema,
  workItemListInputSchema,
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
    if (resource.singular === "incident") {
      registerIncidentListTool(server, client);
      registerGetTool(server, client, resource);
    } else if (resource.singular === "problem" || resource.singular === "change") {
      registerWorkItemListTool(server, client, resource);
      registerGetTool(server, client, resource);
    } else {
      registerReadTools(server, client, resource);
    }

    if (writeResources.has(resource.singular)) {
      registerWriteTools(server, client, resource);
    }
  }

  registerIncidentCommentTools(server, client);
}

function registerReadTools(server: McpServer, client: SwsdClient, resource: ResourceConfig): void {
  registerListTool(server, client, resource);
  registerGetTool(server, client, resource);
}

function registerListTool(server: McpServer, client: SwsdClient, resource: ResourceConfig): void {
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
}

function registerGetTool(server: McpServer, client: SwsdClient, resource: ResourceConfig): void {
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

function registerIncidentListTool(server: McpServer, client: SwsdClient): void {
  server.registerTool(
    "swsd_list_incidents",
    {
      title: "List Incidents",
      description:
        "List SolarWinds Service Desk incidents. For assigned-to queries, use the explicit assignee filter; SWSD silently ignores raw assignee_id/assignee query parameters.",
      inputSchema: incidentListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, assignee, max_pages }) =>
      withToolError(async () => {
        const result = await listIncidents(client, query, assignee, max_pages);
        return {
          incidents: result.incidents,
          meta: result.meta,
        };
      }, "incidents"),
  );
}

function registerWorkItemListTool(server: McpServer, client: SwsdClient, resource: ResourceConfig): void {
  server.registerTool(
    `swsd_list_${resource.plural}`,
    {
      title: `List ${resource.pluralTitle}`,
      description:
        `List SolarWinds Service Desk ${resource.plural}. For assigned-to queries, use the explicit assignee filter; SWSD silently ignores raw assignee_id/assignee query parameters.`,
      inputSchema: workItemListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, assignee, max_pages }) =>
      withToolError(async () => {
        const result = await listWorkItems(client, resource, query, assignee, max_pages);
        return {
          [resource.plural]: result.items,
          meta: result.meta,
        };
      }, resource.plural),
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

interface IncidentListQuery {
  page?: number;
  per_page?: number;
  layout?: "short" | "long";
  state?: string | string[];
  updated?: string;
  updated_from?: string;
  updated_to?: string;
  created_from?: string;
  created_to?: string;
}

interface IncidentAssigneeFilter {
  id?: string | number;
  name?: string;
  email?: string;
}

interface WorkItemListQuery {
  page?: number;
  per_page?: number;
  layout?: "short" | "long";
  state?: string | string[];
}

type AssigneeFilter = IncidentAssigneeFilter;

async function listIncidents(
  client: SwsdClient,
  query: IncidentListQuery | undefined,
  assignee: IncidentAssigneeFilter | undefined,
  maxPages: number | undefined,
): Promise<{ incidents: unknown[]; meta: Record<string, unknown> }> {
  if (!assignee) {
    const states = normalizeStates(query?.state);
    if (states.length <= 1) {
      const serverQuery = buildIncidentServerQuery(query, states[0], query?.page, query?.per_page);
      const incidents = await client.get<unknown[]>("incidents.json", serverQuery);
      return {
        incidents,
        meta: {
          mode: "server",
          server_query: serverQuery,
          warning: "Only documented/supported incident query fields are accepted. Use assignee for exact assigned-to filtering.",
        },
      };
    }

    const incidents = await listIncidentsForStates(client, query, states, query?.page ?? 1, query?.per_page ?? 100);
    return {
      incidents,
      meta: {
        mode: "server_multi_state",
        states,
        page: query?.page ?? 1,
        per_page: query?.per_page ?? 100,
      },
    };
  }

  const pageSize = query?.per_page ?? 100;
  const scanLimit = maxPages ?? 20;
  const states = normalizeStates(query?.state);
  const stateList = states.length > 0 ? states : [undefined];
  const matched: unknown[] = [];
  let scanned = 0;
  let pagesScanned = 0;

  for (const state of stateList) {
    for (let page = 1; page <= scanLimit; page += 1) {
      const serverQuery = buildIncidentServerQuery(query, state, page, pageSize);
      const incidents = await client.get<unknown[]>("incidents.json", serverQuery);
      pagesScanned += 1;
      scanned += incidents.length;
      matched.push(...incidents.filter((incident) => matchesAssignee(incident, assignee)));

      if (incidents.length < pageSize) {
        break;
      }
    }
  }

  return {
    incidents: matched,
    meta: {
      mode: "local_assignee_filter",
      states: states.length > 0 ? states : "all",
      assignee,
      pages_scanned: pagesScanned,
      records_scanned: scanned,
      max_pages: scanLimit,
      per_page: pageSize,
      note: "SWSD ignores raw assignee_id/assignee query parameters for incidents, so this tool filters exact assignee matches from paged API results.",
    },
  };
}

async function listWorkItems(
  client: SwsdClient,
  resource: ResourceConfig,
  query: WorkItemListQuery | undefined,
  assignee: AssigneeFilter | undefined,
  maxPages: number | undefined,
): Promise<{ items: unknown[]; meta: Record<string, unknown> }> {
  const states = normalizeStates(query?.state);
  const needsLocalFilter = assignee !== undefined || states.length > 0;

  if (!needsLocalFilter) {
    const serverQuery = buildWorkItemServerQuery(query, query?.page, query?.per_page);
    const items = await client.get<unknown[]>(`${resource.path}.json`, serverQuery);
    return {
      items,
      meta: {
        mode: "server",
        server_query: serverQuery,
        warning: "Only documented/supported list query fields are accepted. Use assignee for exact assigned-to filtering.",
      },
    };
  }

  const pageSize = query?.per_page ?? 100;
  const scanLimit = maxPages ?? 20;
  const matched: unknown[] = [];
  let scanned = 0;
  let pagesScanned = 0;

  for (let page = 1; page <= scanLimit; page += 1) {
    const serverQuery = buildWorkItemServerQuery(query, page, pageSize);
    const items = await client.get<unknown[]>(`${resource.path}.json`, serverQuery);
    pagesScanned += 1;
    scanned += items.length;
    matched.push(...items.filter((item) => matchesState(item, states) && (assignee === undefined || matchesAssignee(item, assignee))));

    if (items.length < pageSize) {
      break;
    }
  }

  return {
    items: matched,
    meta: {
      mode: "local_filter",
      resource: resource.plural,
      states: states.length > 0 ? states : "all",
      assignee: assignee ?? null,
      pages_scanned: pagesScanned,
      records_scanned: scanned,
      max_pages: scanLimit,
      per_page: pageSize,
      note: "SWSD ignores raw assignee_id/assignee query parameters for this endpoint, so this tool filters exact matches from paged API results.",
    },
  };
}

async function listIncidentsForStates(
  client: SwsdClient,
  query: IncidentListQuery | undefined,
  states: string[],
  page: number,
  perPage: number,
): Promise<unknown[]> {
  const all: unknown[] = [];
  for (const state of states) {
    all.push(...await client.get<unknown[]>("incidents.json", buildIncidentServerQuery(query, state, page, perPage)));
  }
  return all;
}

function buildIncidentServerQuery(
  query: IncidentListQuery | undefined,
  state: string | undefined,
  page: number | undefined,
  perPage: number | undefined,
): QueryParams {
  return {
    page,
    per_page: perPage,
    layout: query?.layout,
    state,
    updated: query?.updated,
    updated_from: query?.updated_from,
    updated_to: query?.updated_to,
    created_from: query?.created_from,
    created_to: query?.created_to,
  };
}

function buildWorkItemServerQuery(
  query: WorkItemListQuery | undefined,
  page: number | undefined,
  perPage: number | undefined,
): QueryParams {
  return {
    page,
    per_page: perPage,
    layout: query?.layout,
  };
}

function normalizeStates(state: string | string[] | undefined): string[] {
  if (state === undefined) {
    return [];
  }
  return Array.isArray(state) ? state : [state];
}

function matchesAssignee(incident: unknown, filter: IncidentAssigneeFilter): boolean {
  if (!isRecord(incident) || !isRecord(incident.assignee)) {
    return false;
  }

  const assignee = incident.assignee;
  return (
    (filter.id === undefined || String(assignee.id) === String(filter.id)) &&
    (filter.name === undefined || String(assignee.name ?? "") === filter.name) &&
    (filter.email === undefined || String(assignee.email ?? "") === filter.email)
  );
}

function matchesState(item: unknown, states: string[]): boolean {
  if (states.length === 0) {
    return true;
  }

  if (!isRecord(item)) {
    return false;
  }

  return states.includes(String(item.state ?? ""));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  if (key === "incidents" && isRecord(value) && Array.isArray(value.incidents)) {
    return {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      structuredContent: value,
    };
  }

  if ((key === "problems" || key === "changes") && isRecord(value) && Array.isArray(value[key])) {
    return {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      structuredContent: value,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: { [key]: value },
  };
}
