# WhatsApp AI configuration and MCP

All customer-facing writing style and fixed automatic-response wording are
visible in AI configuration and editable per workspace. Runtime reads the saved
configuration; there is no second hidden tone, length, greeting or language rule
appended after it. The default values are visible and editable in the same UI
and MCP readback as saved values. Clearing the writing-style field removes that
guidance; `null` restores the visible default.

The configured handoff acknowledgement is used at dispatch. Verification lock,
rejection and success replies, image-read failure text and staff-alert wording
are configurable templates. Placeholder substitution is single-pass and validates
the allowed variables. Verification outcomes, STOP, service windows, permissions,
caller/tenant isolation, factual grounding and dispatch revisions remain code
protections, not editable wording. Approved provider templates remain in their
existing provider workflow and cannot be rewritten by these tools.

## Tools

Every tool resolves current workspace membership and requires WhatsApp manage,
including reads/history. Every successful response names `workspace.id` and
`workspace.name`. Multiple memberships require an explicit `organizationId`.

- `get_whatsapp_ai_settings`: returns stored and effective persona/instructions,
  writing style, handoff text, response templates, business facts, escalation
  keywords, template reference, autopilot and new-chat default, plus a revision.
  Persona/handoff live in the existing shared assistant settings; other channels
  can edit those fields too. New style/templates apply only to WhatsApp.
- `update_whatsapp_ai_settings`: requires `expectedRevision`; append a rule or
  replace `instructions`, and optionally edit `handoffMessage`, `replyStyle` or
  the full `responseMessages` object. Read current templates before replacing
  them. Returns before/after snapshots, workspace, revision and `versionId`.
- `list_whatsapp_ai_settings_history`: compact actor/timestamp/version metadata,
  bounded to 20 entries. Follow `nextOffset`; supply `versionId` for full text.
- `restore_whatsapp_ai_settings_version`: use a fresh revision and a version ID
  from this workspace. `side: "after"` restores that version; `side: "before"`
  undoes it. Restores all four writing fields and backs up the current values,
  retaining every earlier version. Autopilot, business facts, model, chat modes
  and other unrelated settings are not restored by this tool.

Instructions and style are each limited to 6,000 characters, handoff to 1,000,
and each fixed response to 2,000. Empty handoff text is refused by MCP; `null`
restores the visible default. A missing settings row is read without creating it.
These tools make no model/provider call and send no messages.

## Runtime and audit

The existing business audit table stores server-derived actor identity and
before/after snapshots in the same D1 batch or Postgres transaction as the write.
A row lock precedes snapshot comparison on Postgres; stale writes cannot win after
waiting for another edit. Exact raw JSON is used for the template guard so JSON
whitespace/key-order differences do not prevent editing. No in-memory cache or
history map is introduced. Reads are bounded; normal history pages omit text.

UI configuration saves also atomically back up the writing fields and retain a
snapshot of other settings being edited. The existing UI permission model is
retained; WhatsApp-specific fields additionally require WhatsApp manage. No
settings/history delete or prune capability is added. UI changes before this
release are not retroactively versioned; the first edit backs up current text.

New verification messages carry an internal verification message type so history
filtering does not depend on their configurable wording. Legacy verification
phrases remain recognized only for historical filtering, never generated as a
fixed reply. AI text and configured instant answers are no longer rewritten by
an unconditional presentation normalizer. The old staff-name-specific history
rewrite is removed; configured greeting instructions now control responses,
and historical identity answers remain intact. Profile drafts use configured writing
style and do not force a 24-hour response promise.

## Migration and release

SQLite 0115 / PostgreSQL 0094 add nullable `reply_style` and
`response_messages_json` columns. No existing row or saved text is rewritten.
Unset values resolve to the defaults shown in configuration. Both database
engines remain supported. There are no webhook, scheduler, provider-credential
or sending-permission changes.

Code rollback can retain the additive columns and audit history. A code rollback
does not undo saved configuration; restore the desired version first or recover
its backed-up text privately. Production migrations, deployment and requested
workspace-specific updates remain pending owner release approval and verification.
