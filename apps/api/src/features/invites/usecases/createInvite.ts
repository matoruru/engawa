import * as z from "zod";
import { randomBytes } from "crypto";
import { UserIdSchema } from "@/shared/ids";
import type { InvitesRepository } from "../ports";
import { InviteTokenSchema, type InviteToken } from "../domain";

export const CreateInviteInputSchema = z.object({
  userId: UserIdSchema,
});
export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;

export interface CreateInviteDeps {
  invitesRepo: InvitesRepository;
  generateToken: () => InviteToken;
  now: () => Date;
}

export type CreateInviteResult = {
  kind: "created";
  token: InviteToken;
  inviteUrl: string;
};

export const makeCreateInvite =
  (deps: CreateInviteDeps) =>
  async (input: CreateInviteInput): Promise<CreateInviteResult> => {
    const token = deps.generateToken();
    const now = deps.now();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7日後

    const invite = {
      token,
      inviterId: input.userId,
      createdAt: now,
      expiresAt,
      acceptedAt: null,
      acceptedBy: null,
    };

    await deps.invitesRepo.create(invite);

    // 招待URLを生成（フロントエンドのURL + トークン）
    const inviteUrl = `/invites/${token}`;

    return {
      kind: "created",
      token,
      inviteUrl,
    };
  };

