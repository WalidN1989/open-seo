import { describe, expect, it } from "vitest";
import { canTransition } from "./stateMachine";
import {
  optimizationStatusSchema,
  type OptimizationStatus,
} from "@/types/schemas/optimizations";

const ALL = optimizationStatusSchema.options;

describe("the optimization state machine", () => {
  it("lets nothing reach publishing except approval", () => {
    const canPublish = ALL.filter((status) =>
      canTransition(status, "publishing"),
    );
    // `failed` is a retry of a publish that already passed approval, so it is
    // the one other door — and it can only exist downstream of `approved`.
    expect(canPublish.toSorted()).toEqual(["approved", "failed"]);
  });

  it("cannot reach failed without having gone through publishing", () => {
    const reachesFailed = ALL.filter((status) =>
      canTransition(status, "failed"),
    );
    expect(reachesFailed).toEqual(["publishing"]);
  });

  it("refuses to publish a rejected opportunity", () => {
    expect(canTransition("rejected", "publishing")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("refuses to publish work the client asked to change", () => {
    expect(canTransition("changes_requested", "publishing")).toBe(false);
    expect(canTransition("changes_requested", "approved")).toBe(false);
  });

  it("refuses to publish a draft nobody has reviewed", () => {
    for (const status of [
      "detected",
      "briefed",
      "drafted",
      "awaiting_approval",
    ] as OptimizationStatus[]) {
      expect(canTransition(status, "publishing")).toBe(false);
    }
  });

  it("only approves something a person was actually shown", () => {
    const canApprove = ALL.filter((status) =>
      canTransition(status, "approved"),
    );
    expect(canApprove).toEqual(["awaiting_approval"]);
  });

  it("does not put a draft in front of a client on its own", () => {
    // Attaching a draft lands on `drafted`; only an explicit staff action
    // moves it into the client's queue.
    const canQueue = ALL.filter((status) =>
      canTransition(status, "awaiting_approval"),
    );
    expect(canQueue).toEqual(["drafted"]);
  });

  it("treats published and rejected as final", () => {
    for (const target of ALL) {
      expect(canTransition("published", target)).toBe(false);
      expect(canTransition("rejected", target)).toBe(false);
    }
  });

  it("lets an approval be pulled back if someone changes their mind", () => {
    expect(canTransition("approved", "changes_requested")).toBe(true);
  });

  it("has no transition that leaves the known set of statuses", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (canTransition(from, to)) {
          expect(ALL).toContain(to);
          expect(from).not.toBe(to);
        }
      }
    }
  });
});
