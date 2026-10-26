# WhatsApp assistant text over MCP

Four additive tools expose configurable instructions, their version history and
the active fixed handoff text. The active handoff text is read-only. They do not
change the webhook, generation or sending code, other MCP tools, autopilot,
chat modes, provider templates or business facts. Installing this change
requires no migration and rewrites no existing settings.

Every tool resolves current workspace membership and requires the existing
**WhatsApp manage** permission, including reads/history. Email/Social permission
alone is insufficient. Each successful response includes `workspace.id` and
`workspace.name`. `organizationId` is optional only for a single membership.
These existing settings are shared with Email/Social, which the read response
and edit description explicitly disclose.

## Workflow

1. `get_whatsapp_ai_settings({organizationId?})` reads configured `instructions`
   (the persona field), `businessFacts`, stored/effective handoff text, escalation
   keywords, the handoff template reference and a revision. It also reports
   workspace autopilot and the existing new-chat Auto default. A per-chat Manual
   setting is independent. A missing settings row is read without creating one.
2. `update_whatsapp_ai_settings` accepts `organizationId`, `expectedRevision`
   and either `appendRule` or `instructions`. It returns raw before/after text,
   the new revision and `versionId`. Read a fresh revision before editing.
   Combined instructions are limited to 6,000 characters, matching the existing
   configuration limit. Existing text is preserved exactly; append adds a blank
   line separator. Attempts to change `handoffMessage` are refused because the
   active WhatsApp acknowledgement ignores that legacy stored field.
3. `list_whatsapp_ai_settings_history({organizationId?, limit?, offset?})` lists
   compact version metadata, actor IDs and timestamps. Follow `nextOffset` while
   non-null. A `versionId` fetches that workspace's full before/after text.
4. `restore_whatsapp_ai_settings_version({organizationId?, versionId,
expectedRevision, side?})` restores `after` by default. Choose `side: "before"`
   to undo that instruction edit, including the initial pre-MCP text. Restoration
   creates a new backed-up version, leaving every earlier event intact and
   preserving the current stored handoff field.

`instructions: null` uses the existing built-in persona. The read response
includes the legacy stored `handoffMessage`, the actual `effectiveHandoffMessage`,
and `fixedHandoffMessageEditable: false`. Neither an update nor restoration
changes the stored or active handoff text. Configurable instructions are not
the full system prompt: built-in rules, template content and other automatic replies
remain unchanged. In particular, appending instructions alone cannot replace a
fixed handoff acknowledgement.

## Backups, concurrency and rollback

The existing `business_audit_events` store holds version snapshots and the
server-derived caller identity. No actor identity is accepted from tool input.
The backup insert and settings update share an ordered D1 batch or Postgres
transaction through `runBatch`. The settings-row upsert acquires the Postgres row
lock before the snapshot guard is evaluated. Changed field values reject stale
writes after lock acquisition; a unique audit event identifies the winning edit.
If storing the backup fails, the change rolls back. A no-op creates no version.
Only instructions are restored; the current handoff field and unrelated settings
survive.
There is no delete/prune tool and no in-memory version cache.

History covers edits made by these new tools. Existing UI edit behavior and
historical audit events are untouched; the next MCP write backs up the current
values even if the UI last changed them. Replacing or clearing configured
instructions always retains their previous value in the atomic backup. Database errors are
reported without SQL parameters that could expose prompt text.

Code rollback needs no schema rollback. It does not undo explicit settings edits;
restore an appropriate version while the tools remain available, or have the
owner recover the relevant text from the private audit backup. Existing retention
and organization-deletion policies are unchanged.

The owner's requested ability to edit the active handoff message cannot be
fulfilled under the simultaneous instruction not to touch sending code. A scope
clarification is pending; no active-sender change is included. Enabling that
setting requires a separately approved change so the sender reads workspace text.
