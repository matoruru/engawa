import { describe, expect, it } from "bun:test";

import {
  type UserId,
  UserIdSchema,
} from "@/shared/ids";
import type { Invite, InviteToken } from "../domain";
import { InviteTokenSchema } from "../domain";
import type { InvitesRepository } from "../ports";
import type { UserRepository } from "@/shared/ports/users";
import { makeGetInvite } from "./getInvite";

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

class InMemoryUserRepo implements UserRepository {
  private readonly users = new Map<string, { id: string; username: string; displayName: string; avatarUrl: string | null }>();

  async findByIds(userIds: readonly UserId[]): Promise<readonly Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }>> {
    return userIds.map(uid => this.users.get(String(uid))).filter(Boolean) as Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }>;
  }

  async findById(userId: UserId): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null } | null> {
    return this.users.get(String(userId)) || null;
  }

  async findByUsername(username: string): Promise<{ id: string; username: string; displayName: string; avatarUrl: string | null } | null> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  async updateDisplayName(userId: UserId, displayName: string): Promise<void> {
    const user = this.users.get(String(userId));
    if (user) {
      this.users.set(String(userId), { ...user, displayName });
    }
  }

  async updateUsername(userId: UserId, username: string): Promise<void> {
    const user = this.users.get(String(userId));
    if (user) {
      this.users.set(String(userId), { ...user, username });
    }
  }

  async updateAvatarUrl(userId: UserId, avatarUrl: string | null): Promise<void> {
    const user = this.users.get(String(userId));
    if (user) {
      this.users.set(String(userId), { ...user, avatarUrl });
    }
  }

  setUser(user: { id: string; username: string; displayName: string; avatarUrl: string | null }): void {
    this.users.set(user.id, user);
  }
}

// 固定値
const uid = UserIdSchema.parse("01890b42-8d57-7b8f-9f2b-ef2d6c1f6e11");
const token = InviteTokenSchema.parse("test-token-123");
const now = new Date("2025-01-01T00:00:00.000Z");
const future = new Date("2025-01-08T00:00:00.000Z");

describe("getInvite", () => {
  it("should return invite when token exists and not expired", async () => {
    const invitesRepo = new InMemoryInvitesRepo();
    const userRepo = new InMemoryUserRepo();

    const invite: Invite = {
      token,
      inviterId: uid,
      createdAt: now,
      expiresAt: future,
      acceptedAt: null,
      acceptedBy: null,
    };
    await invitesRepo.create(invite);

    userRepo.setUser({
      id: String(uid),
      username: "testuser",
      displayName: "Test User",
      avatarUrl: null,
    });

    const getInvite = makeGetInvite({
      invitesRepo,
      userRepo,
      now: () => now,
    });

    const result = await getInvite({ token });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.invite.token).toBe(token);
      expect(result.invite.inviterId).toBe(String(uid));
      expect(result.invite.inviter).not.toBeNull();
    }
  });

  it("should return notFound when token does not exist", async () => {
    const invitesRepo = new InMemoryInvitesRepo();
    const userRepo = new InMemoryUserRepo();

    const getInvite = makeGetInvite({
      invitesRepo,
      userRepo,
      now: () => now,
    });

    const result = await getInvite({ token });

    expect(result.kind).toBe("notFound");
  });

  it("should return expired when invite is expired", async () => {
    const invitesRepo = new InMemoryInvitesRepo();
    const userRepo = new InMemoryUserRepo();

    const invite: Invite = {
      token,
      inviterId: uid,
      createdAt: now,
      expiresAt: now,
      acceptedAt: null,
      acceptedBy: null,
    };
    await invitesRepo.create(invite);

    const getInvite = makeGetInvite({
      invitesRepo,
      userRepo,
      now: () => future,
    });

    const result = await getInvite({ token });

    expect(result.kind).toBe("expired");
  });

  it("should return alreadyAccepted when invite is already accepted", async () => {
    const invitesRepo = new InMemoryInvitesRepo();
    const userRepo = new InMemoryUserRepo();

    const invite: Invite = {
      token,
      inviterId: uid,
      createdAt: now,
      expiresAt: future,
      acceptedAt: now,
      acceptedBy: uid,
    };
    await invitesRepo.create(invite);

    const getInvite = makeGetInvite({
      invitesRepo,
      userRepo,
      now: () => now,
    });

    const result = await getInvite({ token });

    expect(result.kind).toBe("alreadyAccepted");
  });
});

