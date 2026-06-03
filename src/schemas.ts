import { z } from "zod";

export const idSchema = z.union([z.string().min(1), z.number().int().positive()]);

export const queryParamsSchema = z
  .object({
    page: z.number().int().positive().optional().describe("Page number for paginated endpoints."),
    per_page: z.number().int().positive().max(100).optional().describe("Results per page."),
    layout: z.string().optional().describe("Optional SWSD layout parameter, for example 'short'."),
    name: z.string().optional().describe("Optional name/search filter accepted by many SWSD list endpoints."),
    email: z.string().optional().describe("Optional email filter for user/requester style endpoints."),
    state: z.string().optional().describe("Optional state filter when supported by the endpoint."),
    updated_at: z.string().optional().describe("Optional updated_at filter when supported by the endpoint."),
    created_at: z.string().optional().describe("Optional created_at filter when supported by the endpoint."),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean()]))
  .optional();

export const incidentListInputSchema = {
  query: z
    .object({
      page: z.number().int().positive().optional().describe("Page number. Used directly when no local assignee filter is provided."),
      per_page: z.number().int().positive().max(100).optional().describe("Results per page. Defaults to 100 when local assignee filtering is used."),
      layout: z.enum(["short", "long"]).optional().describe("SWSD response layout. Defaults to short."),
      state: z
        .union([z.string(), z.array(z.string()).min(1)])
        .optional()
        .describe("Incident state or states, for example 'Assigned' or ['Assigned', 'On Hold']."),
      updated: z.string().optional().describe("Updated filter supported by SWSD, for example '7h', '30', or '365'."),
      updated_from: z.string().optional().describe("ISO 8601 start datetime for updated-at filtering."),
      updated_to: z.string().optional().describe("ISO 8601 end datetime for updated-at filtering."),
      created_from: z.string().optional().describe("ISO 8601 start datetime for created-at filtering."),
      created_to: z.string().optional().describe("ISO 8601 end datetime for created-at filtering."),
    })
    .strict()
    .optional()
    .describe("Supported incident list query parameters. Unsupported assignee query params are not accepted because SWSD silently ignores them."),
  assignee: z
    .object({
      id: idSchema.optional().describe("Exact assignee user id to match against incident.assignee.id."),
      name: z.string().optional().describe("Exact assignee display name to match against incident.assignee.name."),
      email: z.string().optional().describe("Exact assignee email to match against incident.assignee.email."),
    })
    .strict()
    .refine((value) => value.id !== undefined || value.name !== undefined || value.email !== undefined, {
      message: "Provide at least one of assignee.id, assignee.name, or assignee.email.",
    })
    .optional()
    .describe("Exact local assignee filter. Use this instead of raw assignee_id/query params; SWSD ignores those for incidents."),
  max_pages: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Maximum pages to scan when assignee filtering is used. Defaults to 20."),
};

export const workItemListInputSchema = {
  query: z
    .object({
      page: z.number().int().positive().optional().describe("Page number. Used directly when no local filter is provided."),
      per_page: z.number().int().positive().max(100).optional().describe("Results per page. Defaults to 100 when local filtering is used."),
      layout: z.enum(["short", "long"]).optional().describe("SWSD response layout. Defaults to short."),
      state: z
        .union([z.string(), z.array(z.string()).min(1)])
        .optional()
        .describe("Problem/change state or states. When provided, this tool filters exact state matches locally."),
    })
    .strict()
    .optional()
    .describe("Supported list query parameters. Unsupported assignee query params are not accepted because SWSD silently ignores them."),
  assignee: z
    .object({
      id: idSchema.optional().describe("Exact assignee user id to match against item.assignee.id."),
      name: z.string().optional().describe("Exact assignee display name to match against item.assignee.name."),
      email: z.string().optional().describe("Exact assignee email to match against item.assignee.email."),
    })
    .strict()
    .refine((value) => value.id !== undefined || value.name !== undefined || value.email !== undefined, {
      message: "Provide at least one of assignee.id, assignee.name, or assignee.email.",
    })
    .optional()
    .describe("Exact local assignee filter. Use this instead of raw assignee_id/query params; SWSD ignores those for problems and changes."),
  max_pages: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Maximum pages to scan when local filtering is used. Defaults to 20."),
};

export const rawPayloadSchema = z
  .record(z.unknown())
  .describe("Raw SolarWinds Service Desk JSON payload. Include the top-level resource key when the API requires it.");

export const listInputSchema = {
  query: queryParamsSchema,
};

export const getInputSchema = {
  id: idSchema.describe("SolarWinds Service Desk resource id or number."),
};

export const writeInputSchema = {
  payload: rawPayloadSchema,
  query: queryParamsSchema,
};

export const updateInputSchema = {
  id: idSchema.describe("SolarWinds Service Desk resource id or number."),
  payload: rawPayloadSchema,
  query: queryParamsSchema,
};
