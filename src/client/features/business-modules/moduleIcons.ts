import {
  FileBarChart,
  Blocks,
  Bot,
  ContactRound,
  Mail,
  MessagesSquare,
  PlugZap,
  ReceiptText,
  ShieldCheck,
  Share2,
  MessageSquareText,
} from "lucide-react";
import type { BusinessModuleKey } from "@/shared/business-modules";

export const businessModuleIcons = {
  leads: ContactRound,
  crm: Blocks,
  whatsapp: MessagesSquare,
  sms: MessageSquareText,
  voice: Bot,
  email: Mail,
  social: Share2,
  invoicing: ReceiptText,
  reports: FileBarChart,
  clients: ShieldCheck,
  integrations: PlugZap,
} satisfies Record<BusinessModuleKey, typeof Blocks>;
