# swsd-mcp

Local stdio MCP server for the SolarWinds Service Desk API.

This server is intentionally API-shaped. Tool names use the `swsd_` prefix. Write tools validate the resource wrapper and common fields, then pass payloads through to SolarWinds Service Desk JSON endpoints.

## Tools

- `swsd_list_incidents`
- `swsd_get_incident`
- `swsd_create_incident`
- `swsd_update_incident`
- `swsd_list_incident_comments`
- `swsd_create_private_incident_comment`
- `swsd_list_users`
- `swsd_get_user`
- `swsd_list_categories`
- `swsd_get_category`
- `swsd_list_sites`
- `swsd_get_site`
- `swsd_list_departments`
- `swsd_get_department`
- `swsd_list_problems`
- `swsd_get_problem`
- `swsd_create_problem`
- `swsd_update_problem`
- `swsd_list_changes`
- `swsd_get_change`
- `swsd_create_change`
- `swsd_update_change`

Comments created through `swsd_create_private_incident_comment` always send `comment.is_private: true`, even if `extra_comment_fields` contains a different value.

## Configuration

Required environment variable:

```sh
export SOLARWINDS_SERVICE_DESK_TOKEN="your-api-token"
```

Optional:

```sh
export SOLARWINDS_SERVICE_DESK_BASE_URL="https://api.samanage.com"
export SOLARWINDS_SERVICE_DESK_ACCEPT="application/vnd.samanage.v2.1+json"
```

You can also place local settings in `.env`:

```sh
SOLARWINDS_SERVICE_DESK_TOKEN="your-api-token"
SOLARWINDS_SERVICE_DESK_BASE_URL="https://api.samanage.com"
```

`.env` and `.env.*` are git ignored. Keep real API tokens out of committed files.

Regional base URLs commonly include:

- US: `https://api.samanage.com`
- EU: `https://apieu.samanage.com`
- APJ: `https://apiau.samanage.com`

## Build

```sh
npm install
npm run build
```

## Run Locally

```sh
set -a
. ./.env
set +a
node dist/index.js
```

The server speaks MCP over stdio. It does not run an HTTP server.

## Smoke Test

Run the automated checks (mocked HTTP and in-memory MCP; no credentials or live API calls):

```sh
npm test
```

Build first:

```sh
npm run build
```

Then run a read-only API check from `.env`:

```sh
set -a
. ./.env
set +a
node -e 'import("./dist/client.js").then(async ({SwsdClient}) => { const client = new SwsdClient(); for (const path of ["incidents.json", "users.json", "categories.json", "sites.json", "departments.json", "problems.json", "changes.json"]) { const data = await client.get(path, { per_page: 1 }); console.log(`${path}: ${Array.isArray(data) ? data.length : "ok"}`); } })'
```

You can also test the MCP tool layer with any MCP client by calling `swsd_list_incidents` using:

```json
{
  "query": {
    "per_page": 1
  }
}
```

## MCP Client Config

Use this server with any AI tool or harness that supports local stdio MCP servers, such as Codex, Claude Code, Cursor, and similar clients.

Example local config:

```json
{
  "mcpServers": {
    "swsd": {
      "command": "node",
      "args": ["/Users/james_davis/repositories/swsd-mcp/dist/index.js"],
      "env": {
        "SOLARWINDS_SERVICE_DESK_TOKEN": "your-api-token",
        "SOLARWINDS_SERVICE_DESK_BASE_URL": "https://api.samanage.com"
      }
    }
  }
}
```

The exact config file location and naming varies by client, but the command, args, and environment variables are the same.

## Payload Examples

Create an incident:

```json
{
  "payload": {
    "incident": {
      "name": "Printer is offline",
      "description": "The reception printer is not responding.",
      "priority": "Medium"
    }
  }
}
```

Create a change request:

```json
{
  "payload": {
    "change": {
      "name": "Patch file server",
      "description": "Apply monthly OS patches to the file server.",
      "priority": "Medium",
      "change_type": "Normal"
    }
  }
}
```

Add a private incident comment:

```json
{
  "incident_id": 12345,
  "body": "Automation checked the requester details. This note is private."
}
```

## API Notes

- Authentication uses `X-Samanage-Authorization: Bearer <token>`.
- Requests use JSON endpoints such as `incidents.json`, `users.json`, `changes.json`, and `problems.json`.
- List tools accept a `query` object and pass those fields through as query parameters.
- `swsd_list_incidents`, `swsd_list_problems`, and `swsd_list_changes` are stricter than the other raw list tools. SolarWinds Service Desk silently ignores unsupported assignee query parameters such as `assignee_id`, so assigned-to filtering uses an explicit local `assignee` argument instead.
- Create/update tools require a top-level object named after the resource: `incident`, `problem`, or `change`. Empty resource objects and unexpected top-level keys are rejected. Common fields (`name`, `description`, `priority`, `state`) are typed strings; other fields inside the resource, including custom fields, pass through unchanged. SWSD still validates account-specific fields and required values.
- This tightens the previous raw payload contract: existing correctly wrapped payloads remain supported; unwrapped or empty payloads must be corrected.
- Update tools advertise potentially destructive, non-idempotent behaviour because fields can be overwritten and workflows may have side effects. These annotations describe risk; authorization remains the client's responsibility.

List incidents, problems, or changes directly assigned to a user:

```json
{
  "query": {
    "state": ["Assigned", "On Hold"],
    "per_page": 100,
    "layout": "short"
  },
  "assignee": {
    "id": 3463573
  },
  "max_pages": 10
}
```

When `assignee` is provided, the tool pages through SWSD results and filters exact matches against the resource's `assignee.id`, `assignee.name`, or `assignee.email`. Problems and changes also scan locally when a state filter is supplied. Local scans start at page 1; `query.page` applies only when no local filtering is used.

Local scan responses include `meta.pages_scanned`, `meta.records_scanned`, `meta.complete`, and `meta.truncated`. A full final page at the scan limit means `complete: false`, `truncated: true`, and an explicit warning—even if no matching records were found. This conservatively means more records may exist, not that omitted matches are known to exist. `complete: true` means the scan reached a short or empty page for each requested state; it does not guarantee a snapshot if records change during pagination.

The default scan limit is 20 pages, configurable up to 50 with `max_pages`. For incidents, that limit applies separately to each requested state. Narrow the query or increase the limit before drawing exhaustive conclusions from a capped scan. Unfiltered lists return one page; incident lists with multiple states and no assignee return one page per state.

## Request Reliability

- Each HTTP attempt has a 15-second timeout covering both headers and response body. Code using `SwsdClient` directly can override it with a positive integer `timeoutMs` option.
- GET requests retry at most twice after network errors, timeouts, or HTTP 408, 429, 500, 502, 503, and 504. Other HTTP errors fail immediately.
- Retries use 500ms then 1000ms backoff unless `Retry-After` specifies seconds or an HTTP date. Delays exceeding five seconds surface the API error, including `Retry-After`, instead of retrying early or keeping a tool call waiting indefinitely.
- POST and PUT requests are never automatically retried. A write timeout explicitly warns that the operation may already have succeeded. Verify the record before repeating any write after a timeout or lost connection.
