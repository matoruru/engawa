import { describe, expect, it } from "bun:test";

import {
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { Invite, InviteToken } from "../domain";
import { InviteTokenSchema } from "../domain";
import type { InvitesRepository } from "../ports";
import { makeCreateInvite } from "./createInvite";

// --- Test doubles ---
class InMemoryInvitesRepo implements InvitesRepository {
  private readonly invites = new Map<string, Invite>();

  async create(invite: Invite): Promise<void> {
    this.invites.set(invite.token, invite);
  }

  async findByToken(token: InviteToken): Promise<Invite | null> {
    return this.invites.get(token) || null;
  }

  async accept(token: InviteToken, acceptedBy: UserId): Promise<void> {
    const invite = this.invites.get(token);
    if (invite) {
      this.invites.set(token, {
        ...invite,
        acceptedAt: new Date(),
        acceptedBy,
      });
    }
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const fixedDate = new Date("2025-01-01T00:00:00.000Z");

describe("createInvite", () => {
  it("should create invite", async () => {
    const invitesRepo = new InMemoryInvitesRepo();
    const token = InviteTokenSchema.parse("test-token-123");

    const createInvite = makeCreateInvite({
      invitesRepo,
      generateToken: () => token,
      now: () => fixedDate,
    });

    const result = await createInvite({
      userId: uid,
    });

    expect(result.kind).toBe("created");
    expect(result.token).toBe(token);
    expect(result.inviteUrl).toBe(`/invites/${token}`);

    const invite = await invitesRepo.findByToken(token);
    expect(invite).not.toBeNull();
    if (invite) {
      expect(invite.inviterId).toBe(uid);
      expect(invite.createdAt).toEqual(fixedDate);
      expect(invite.acceptedAt).toBeNull();
    }
  });
});

