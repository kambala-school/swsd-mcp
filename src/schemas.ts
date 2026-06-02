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
