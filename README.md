# swsd-mcp

Local stdio MCP server for the SolarWinds Service Desk API.

This server is intentionally raw/API-shaped. Tool names use the `swsd_` prefix and payloads are passed through to SolarWinds Service Desk JSON endpoints.

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
- Write tools send payloads as-is. SolarWinds Service Desk often expects a top-level object named after the resource, such as `incident`, `problem`, or `change`.
