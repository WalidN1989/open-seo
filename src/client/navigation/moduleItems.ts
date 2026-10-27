import {
  Blocks,
  Building2,
  CalendarDays,
  ClipboardList,
  ContactRound,
  FileSignature,
  Inbox,
  LayoutDashboard,
  Package,
  Plug,
  ShoppingCart,
  Truck,
  UserRound,
  Radar,
  ChartNoAxesColumn,
  MessageSquareText,
} from "lucide-react";
import { linkOptions } from "@tanstack/react-router";

/**
 * A module owns the sidebar while you are inside it, the way a section of a
 * large console does. The alternative — stacking every section onto one page —
 * is what made the modules feel cramped while wasting the width beside them.
 *
 * A module with only an overview still returns a group, so entering any module
 * behaves the same way and the back link is always in the same place.
 */
export function getModuleNavGroups(moduleKey: string, projectId: string) {
  const crmNavGroups = [
    {
      label: "CRM",
      items: [
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm",
          label: "Overview",
          icon: LayoutDashboard,
          // Without exact matching the index path prefixes every CRM route and
          // would render active on all of them.
          activeOptions: { exact: true, includeSearch: false },
        }),
        linkOptions({
          to: "/p/$projectId/modules/$moduleKey",
          params: { projectId, moduleKey: "leads" },
          label: "Leads",
          icon: ContactRound,
          activeOptions: { exact: true, includeSearch: false },
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/prospects",
          label: "Prospects",
          icon: Radar,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/contacts",
          label: "Contacts",
          icon: UserRound,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/companies",
          label: "Companies",
          icon: Building2,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/inquiries",
          label: "Inquiries",
          icon: Inbox,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/meetings",
          label: "Meetings",
          icon: CalendarDays,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/quotations",
          label: "Quotations",
          icon: FileSignature,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/sms",
          label: "SMS",
          icon: MessageSquareText,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/analytics",
          label: "Analytics",
          icon: ChartNoAxesColumn,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/products",
          label: "Products",
          icon: Package,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/inventory",
          label: "Inventory",
          icon: ClipboardList,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/orders",
          label: "Orders",
          icon: ShoppingCart,
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/crm/citypak",
          label: "Citypak Waybills",
          icon: Truck,
        }),
      ],
    },
  ];

  const integrationsNavGroups = [
    {
      label: "Integrations",
      items: [
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/integrations",
          label: "Catalogue",
          icon: Blocks,
          activeOptions: { exact: true, includeSearch: false },
        }),
        linkOptions({
          params: { projectId },
          to: "/p/$projectId/modules/integrations/connections",
          label: "Connections",
          icon: Plug,
        }),
      ],
    },
  ];

  if (moduleKey === "crm" || moduleKey === "leads") return crmNavGroups;
  if (moduleKey === "integrations") return integrationsNavGroups;
  const module = {
    whatsapp: { label: "WhatsApp", icon: Inbox },
    voice: { label: "Voice Agent", icon: LayoutDashboard },
    email: { label: "Email", icon: Inbox },
    social: { label: "Social", icon: Inbox },
  }[moduleKey];

  if (!module) return [];

  return [
    {
      label: module.label,
      items: [
        linkOptions({
          to: "/p/$projectId/modules/$moduleKey",
          params: { projectId, moduleKey },
          label: "Overview",
          icon: module.icon,
          activeOptions: { exact: true, includeSearch: false },
        }),
      ],
    },
  ];
}
