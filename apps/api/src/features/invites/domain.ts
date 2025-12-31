import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";

export const InviteTokenSchema = z.string().min(1).brand("InviteToken");
export type InviteToken = z.infer<typeof InviteTokenSchema>;

export const InviteSchema = z.object({
  token: InviteTokenSchema,
  inviterId: UserIdSchema,
  createdAt: z.date(),
  expiresAt: z.date(),
  acceptedAt: z.date().nullable(),
  acceptedBy: UserIdSchema.nullable(),
});
export type Invite = z.infer<typeof InviteSchema>;

