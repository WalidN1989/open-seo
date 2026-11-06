import { z } from "zod";
import type { generateWhatsappAiReply } from "../providers/whatsapp-ai";
import { OrderService } from "@/server/features/commerce/services/OrderService";
import { WhatsappReplyControlRepository as Control } from "../repositories/WhatsappReplyControlRepository";
import { WhatsappHandoffService } from "./WhatsappHandoffService";

export async function applyActions(
  organizationId: string,
  conversationId: string,
  revision: number,
  actions: NonNullable<
    Awaited<ReturnType<typeof generateWhatsappAiReply>>
  >["actions"],
) {
  for (const action of actions) {
    if (
      !(await Control.isCurrent(organizationId, conversationId, revision, true))
    )
      return;
    if (action.name === "flag_for_team") continue;
    const rawAmount = Number(action.input.amount_cents || 0);
    await Control.createOrder(
      organizationId,
      conversationId,
      revision,
      typeof action.input.summary === "string"
        ? action.input.summary.slice(0, 2000)
        : "Customer order enquiry",
      Number.isSafeInteger(rawAmount) && rawAmount >= 0 ? rawAmount : 0,
    );
  }
}

export async function handoffFromActions(
  organizationId: string,
  conversationId: string,
  revision: number,
  actions: NonNullable<
    Awaited<ReturnType<typeof generateWhatsappAiReply>>
  >["actions"],
  context: { body: string; verificationRequired: boolean },
) {
  const { body, verificationRequired } = context;
  const handoff = actions.find((action) => action.name === "flag_for_team");
  const order = actions.find(
    (action) => action.name === "create_order_request",
  );
  if (!handoff && !order) return false;
  const reason =
    typeof handoff?.input.reason === "string"
      ? handoff.input.reason.trim().slice(0, 300)
      : "Order/preorder request needs staff confirmation";
  const summary =
    typeof handoff?.input.summary === "string"
      ? handoff.input.summary.trim().slice(0, 600)
      : typeof order?.input.summary === "string"
        ? order.input.summary.trim().slice(0, 600)
        : body.slice(0, 600);
  const acknowledgement = verificationRequired
    ? "I couldn't match this order to your WhatsApp number. I've saved the enquiry here for staff to verify ownership and help you; I can't confirm another number's order details."
    : order
      ? "I've saved your request for staff review here. This is a request, not a confirmed order; the team still needs to confirm item prices, delivery charges and availability before you commit."
      : null;
  await WhatsappHandoffService.start(
    organizationId,
    conversationId,
    revision,
    reason || "Customer needs assistance",
    acknowledgement
      ? { summary: summary || "Customer needs assistance", acknowledgement }
      : summary || "Customer needs assistance",
  );
  return true;
}

/** Failed sender-bound lookups require review even if the model forgets to flag. */
export function senderOrderLookup(
  organizationId: string,
  sender: string,
  body: string,
) {
  const actions: Array<{
    name: "flag_for_team";
    input: Record<string, unknown>;
  }> = [];
  return {
    actions,
    lookup: async (orderId: string) => {
      const payload = await OrderService.lookupCustomerOrder(
        organizationId,
        sender,
        orderId,
      );
      const lookup = z
        .object({ found: z.boolean() })
        .safeParse(JSON.parse(payload));
      if (lookup.success && !lookup.data.found)
        actions.push({
          name: "flag_for_team",
          input: {
            reason: "Order ownership needs staff verification",
            summary: `Sender-bound lookup could not match ${orderId.slice(0, 100) || "a recent order"}. Verify ownership before disclosing details. Customer enquiry: ${body.slice(0, 350)}`,
          },
        });
      return payload;
    },
  };
}
