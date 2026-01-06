import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { FriendshipsRepository } from "../../friendships/ports";
import { InviteTokenSchema } from "../domain";
import type { InvitesRepository } from "../ports";

export const AcceptInviteInputSchema = z.object({
  token: InviteTokenSchema,
  userId: UserIdSchema,
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;

export interface AcceptInviteDeps {
  invitesRepo: InvitesRepository;
  friendshipsRepo: FriendshipsRepository;
  now: () => Date;
}

export type AcceptInviteResult =
  | { kind: "accepted" }
  | { kind: "notFound" }
  | { kind: "expired" }
  | { kind: "alreadyAccepted" }
  | { kind: "conflict"; reason: "SELF_INVITE" | "ALREADY_FRIEND" };

export const makeAcceptInvite =
  (deps: AcceptInviteDeps) =>
  async (input: AcceptInviteInput): Promise<AcceptInviteResult> => {
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

    // 自分自身の招待は受け入れられない
    if (invite.inviterId === input.userId) {
      return { kind: "conflict", reason: "SELF_INVITE" };
    }

    // 既に友達かチェック
    const isAlreadyFriend = await deps.friendshipsRepo.isFriend(
      invite.inviterId,
      input.userId,
    );
    if (isAlreadyFriend) {
      return { kind: "conflict", reason: "ALREADY_FRIEND" };
    }

    // 招待を受け入れる
    await deps.invitesRepo.accept(input.token, input.userId);

    // 友達関係を作成
    await deps.friendshipsRepo.addFriendship(invite.inviterId, input.userId);

    return { kind: "accepted" };
  };
