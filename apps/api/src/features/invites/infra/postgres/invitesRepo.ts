import * as z from "zod";
import type { PostgresClient } from "@/shared/infra/postgres/postgresClient";
import type { UserId } from "@/shared/ids";
import type { Invite, InviteToken } from "../../domain";
import type { InvitesRepository } from "../../ports";

const InviteRowSchema = z.object({
  token: z.string(),
  inviter_id: z.string(),
  created_at: z.date(),
  expires_at: z.date(),
  accepted_at: z.date().nullable(),
  accepted_by: z.string().nullable(),
});

export const makePostgresInvitesRepo = (
  db: PostgresClient,
): InvitesRepository => ({
  create: async (invite: Invite): Promise<void> => {
    await db`
      INSERT INTO invites (token, inviter_id, created_at, expires_at, accepted_at, accepted_by)
      VALUES (${invite.token}, ${invite.inviterId}, ${invite.createdAt}, ${invite.expiresAt}, ${invite.acceptedAt}, ${invite.acceptedBy})
    `;
  },

  findByToken: async (token: InviteToken): Promise<Invite | null> => {
    const rows = await db`
      SELECT token, inviter_id, created_at, expires_at, accepted_at, accepted_by
      FROM invites
      WHERE token = ${token}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const parsed = InviteRowSchema.parse(rows[0]);
    return {
      token: parsed.token as InviteToken,
      inviterId: String(parsed.inviter_id) as UserId,
      createdAt: parsed.created_at,
      expiresAt: parsed.expires_at,
      acceptedAt: parsed.accepted_at,
      acceptedBy: parsed.accepted_by ? (String(parsed.accepted_by) as UserId) : null,
    };
  },

  accept: async (token: InviteToken, acceptedBy: UserId): Promise<void> => {
    await db`
      UPDATE invites
      SET accepted_at = now(), accepted_by = ${acceptedBy}
      WHERE token = ${token}
    `;
  },
});

