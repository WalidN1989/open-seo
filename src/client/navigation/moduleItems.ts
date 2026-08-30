import {
  Blocks,
  Building2,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Plug,
  UserRound,
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
const crmNavGroups = [
  {
    label: "CRM",
    items: [
      linkOptions({
        to: "/modules/crm",
        label: "Overview",
        icon: LayoutDashboard,
        // Without exact matching the index path prefixes every CRM route and
        // would render active on all of them.
        activeOptions: { exact: true, includeSearch: false },
      }),
      linkOptions({
        to: "/modules/crm/contacts",
        label: "Contacts",
        icon: UserRound,
      }),
      linkOptions({
        to: "/modules/crm/companies",
        label: "Companies",
        icon: Building2,
      }),
      linkOptions({
        to: "/modules/crm/inquiries",
        label: "Inquiries",
        icon: Inbox,
      }),
      linkOptions({
        to: "/modules/crm/meetings",
        label: "Meetings",
        icon: CalendarDays,
      }),
    ],
  },
];

const integrationsNavGroups = [
  {
    label: "Integrations",
    items: [
      linkOptions({
        to: "/modules/integrations",
        label: "Catalogue",
        icon: Blocks,
        activeOptions: { exact: true, includeSearch: false },
      }),
      linkOptions({
        to: "/modules/integrations/connections",
        label: "Connections",
        icon: Plug,
      }),
    ],
  },
];

export function getModuleNavGroups(moduleKey: string) {
  if (moduleKey === "crm") return crmNavGroups;
  if (moduleKey === "integrations") return integrationsNavGroups;
  const module = {
    leads: { label: "Leads", icon: UserRound },
    whatsapp: { label: "WhatsApp", icon: Inbox },
    voice: { label: "Voice Agent", icon: LayoutDashboard },
  }[moduleKey];

  if (!module) return [];

  return [
    {
      label: module.label,
      items: [
        linkOptions({
          to: "/modules/$moduleKey",
          params: { moduleKey },
          label: "Overview",
          icon: module.icon,
          activeOptions: { exact: true, includeSearch: false },
        }),
      ],
    },
  ];
}
