import * as z from "zod";
import { InviteTokenSchema } from "../domain";
import type { InvitesRepository } from "../ports";

export const GetInviteInputSchema = z.object({
  token: InviteTokenSchema,
});
export type GetInviteInput = z.infer<typeof GetInviteInputSchema>;

export interface GetInviteDeps {
  invitesRepo: InvitesRepository;
  now: () => Date;
}

export type GetInviteResult =
  | { kind: "ok"; invite: { token: string; inviterId: string; expiresAt: string; acceptedAt: string | null } }
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

    return {
      kind: "ok",
      invite: {
        token: invite.token,
        inviterId: String(invite.inviterId),
        expiresAt: invite.expiresAt.toISOString(),
        acceptedAt: invite.acceptedAt?.toISOString() || null,
      },
    };
  };

