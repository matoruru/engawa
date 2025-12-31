import * as z from "zod";
import { InviteTokenSchema } from "../domain";
import type { InvitesRepository } from "../ports";
import type { UserRepository } from "@/shared/ports/users";

export const GetInviteInputSchema = z.object({
  token: InviteTokenSchema,
});
export type GetInviteInput = z.infer<typeof GetInviteInputSchema>;

export interface GetInviteDeps {
  invitesRepo: InvitesRepository;
  userRepo: UserRepository;
  now: () => Date;
}

export type GetInviteResult =
  | { kind: "ok"; invite: { token: string; inviterId: string; expiresAt: string; acceptedAt: string | null; inviter: { id: string; username: string; displayName: string } | null } }
  | { kind: "notFound" }
  | { kind: "expired" }
  | { kind: "alreadyAccepted" };

export const makeGetInvite =
  (deps: GetInviteDeps) =>
  async (input: GetInviteInput): Promise<GetInviteResult> => {
    const invite = await deps.invitesRepo.findByToken(input.token);

    if (!invite) {
      return { kind: "notFound" };
    }

    if (invite.acceptedAt) {
      return { kind: "alreadyAccepted" };
    }

    const now = deps.now();
    if (invite.expiresAt < now) {
      return { kind: "expired" };
    }

    // 招待者の情報を取得
    const users = await deps.userRepo.findByIds([invite.inviterId]);
    const inviter = users.length > 0 ? {
      id: String(users[0].id),
      username: users[0].username,
      displayName: users[0].displayName,
      avatarUrl: users[0].avatarUrl,
    } : null;

    return {
      kind: "ok",
      invite: {
        token: invite.token,
        inviterId: String(invite.inviterId),
        expiresAt: invite.expiresAt.toISOString(),
        acceptedAt: invite.acceptedAt ? new Date(invite.acceptedAt).toISOString() : null,
        inviter,
      },
    };
  };

