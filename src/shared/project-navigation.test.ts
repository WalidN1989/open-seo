import { describe, expect, it } from "vitest";
import {
  PROJECT_SCOPE_HEADER,
  projectAddressFromPath,
  projectScopeHeaders,
  projectScopedPath,
  switchedProjectPath,
} from "./project-navigation";

describe("project addresses across business modules", () => {
  it.each([
    "/p/digital-urgency-aus/modules/leads",
    "/p/digital-urgency-aus/modules/whatsapp",
    "/p/digital-urgency-aus/modules/crm/orders",
    "/p/digital-urgency-aus/workspace-settings",
  ])("selects the URL's project for %s", (path) => {
    expect(projectScopeHeaders(path)).toEqual({
      [PROJECT_SCOPE_HEADER]: "digital-urgency-aus",
    });
  });

  it("keeps UUID bookmarks usable and does not scope public/account routes", () => {
    const id = "ec6916d6-8473-4847-b742-d6b24547c541";
    expect(projectAddressFromPath(`/p/${id}`)).toBe(id);
    expect(projectScopeHeaders("/sign-in")).toEqual({});
    expect(projectScopeHeaders("/modules/leads")).toEqual({});
    expect(projectAddressFromPath("/projects")).toBeNull();
  });

  it("decodes an address before the server validates it", () => {
    expect(projectAddressFromPath("/p/boox%77orm/modules/whatsapp")).toBe(
      "booxworm",
    );
    expect(projectAddressFromPath("/p/bad%ZZ/modules/leads")).toBe("bad%ZZ");
  });

  it("redirects account settings without replacing existing SEO settings", () => {
    expect(projectScopedPath("booxworm", "/settings")).toBe(
      "/p/booxworm/workspace-settings",
    );
    expect(projectScopedPath("booxworm", "/modules/crm/orders")).toBe(
      "/p/booxworm/modules/crm/orders",
    );
    expect(projectScopedPath("booxworm", "/p/booxworm/settings")).toBe(
      "/p/booxworm/settings",
    );
  });

  it.each([
    ["/p/du/modules/whatsapp", "/p/booxworm/modules/whatsapp"],
    ["/p/du/modules/crm/orders", "/p/booxworm/modules/crm/orders"],
    ["/p/du/modules/invoicing", "/p/booxworm/modules/invoicing"],
    ["/p/du/settings/integrations", "/p/booxworm/settings/integrations"],
    ["/p/du/workspace-settings", "/p/booxworm/workspace-settings"],
    ["/p/du", "/p/booxworm"],
    ["/projects", "/p/booxworm"],
  ])("preserves the section when switching from %s", (path, expected) => {
    expect(switchedProjectPath(path, "booxworm")).toBe(expected);
  });

  it.each([
    ["/p/du/modules/leads/lead-from-du", "/modules/leads"],
    ["/p/du/modules/quotes/quote-from-du", "/modules/crm/quotations"],
    ["/p/du/modules/crm/products/product-from-du", "/modules/crm/products"],
    ["/p/du/audit/issues/result-from-du", "/audit"],
    ["/p/du/rank-tracking/config-from-du", "/rank-tracking"],
  ])("drops the old project's entity ID from %s", (path, expected) => {
    expect(switchedProjectPath(path, "booxworm")).toBe(
      `/p/booxworm${expected}`,
    );
  });
});
