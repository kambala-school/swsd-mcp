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
      layout: z.enum(["short", "long"]).optional().describe("SWSD response layout. Omit to use the API default."),
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
    .describe("Maximum pages to scan per state when assignee filtering is used. Defaults to 20. A full final page sets meta.truncated=true and meta.complete=false."),
};

export const workItemListInputSchema = {
  query: z
    .object({
      page: z.number().int().positive().optional().describe("Page number. Used directly when no local filter is provided."),
      per_page: z.number().int().positive().max(100).optional().describe("Results per page. Defaults to 100 when local filtering is used."),
      layout: z.enum(["short", "long"]).optional().describe("SWSD response layout. Omit to use the API default."),
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
    .describe("Maximum pages to scan when local filtering is used. Defaults to 20. A full final page sets meta.truncated=true and meta.complete=false."),
};

export const listInputSchema = {
  query: queryParamsSchema,
};

export const getInputSchema = {
  id: idSchema.describe("SolarWinds Service Desk resource id or number."),
};

export function writeInputSchema(resource: string) {
  return {
    payload: z.object({
      [resource]: z.object({
        name: z.string().min(1).optional().describe("Resource title, for example 'Printer is offline'."),
        description: z.string().optional().describe("Resource description."),
        priority: z.string().min(1).optional().describe("Priority accepted by your SWSD account, for example 'Medium'."),
        state: z.string().min(1).optional().describe("State accepted by your SWSD account. Updates may trigger workflow actions."),
      }).passthrough().refine((value) => Object.values(value).some((field) => field !== undefined), {
        message: "Provide at least one resource field.",
      }).describe(`Fields for the ${resource}. Additional SWSD fields, including custom fields, are passed through unchanged.`),
    }).strict().describe(`Required wrapper, for example {"${resource}": {"name": "Printer is offline"}}. SWSD validates account-specific required fields.`),
    query: queryParamsSchema,
  };
}
