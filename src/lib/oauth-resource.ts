const MCP_RESOURCE_PATH = "/mcp";
export const MCP_SCOPE = "mcp";
export const MCP_ACCESS_SCOPES = [
  "business:read",
  "business:write",
  "voice:read",
  "voice:write",
] as const;
export const MCP_OAUTH_SCOPES = [
  "offline_access",
  MCP_SCOPE,
  ...MCP_ACCESS_SCOPES,
];

export function getMcpResource(baseUrl: string) {
  return new URL(MCP_RESOURCE_PATH, baseUrl).toString();
}
