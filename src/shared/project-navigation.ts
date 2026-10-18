export const PROJECT_SCOPE_HEADER = "x-openseo-project";

/** The URL selects a workspace; the server must still authorize membership. */
export function projectAddressFromPath(pathname: string): string | null {
  const segment = pathname.match(/^\/p\/([^/]+)(?:\/|$)/)?.[1];
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function projectScopeHeaders(pathname: string): Record<string, string> {
  const address = projectAddressFromPath(pathname);
  return address ? { [PROJECT_SCOPE_HEADER]: address } : {};
}

export function projectScopedPath(address: string, path: string): string {
  if (path.startsWith("/p/")) return path;
  return `/p/${encodeURIComponent(address)}${path === "/settings" ? "/workspace-settings" : path}`;
}

/** Entity IDs and conversation filters belong to the workspace being left. */
export function switchedProjectPath(pathname: string, address: string): string {
  if (!projectAddressFromPath(pathname))
    return `/p/${encodeURIComponent(address)}`;
  const section = pathname
    .replace(/^\/p\/[^/]+/, "")
    .replace(/^\/modules\/leads\/.+$/, "/modules/leads")
    .replace(/^\/modules\/quotes\/.+$/, "/modules/crm/quotations")
    .replace(/^\/modules\/crm\/products\/.+$/, "/modules/crm/products")
    .replace(/^\/(audit|rank-tracking)\/.+$/, "/$1");
  return projectScopedPath(address, section).replace(/\/$/, "");
}
