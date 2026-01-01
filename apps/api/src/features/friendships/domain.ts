import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";

export const FriendshipSchema = z.object({
  userId: UserIdSchema,
  friendId: UserIdSchema,
  createdAt: z.date(),
});
export type Friendship = z.infer<typeof FriendshipSchema>;

export const FriendInfoSchema = z.object({
  id: UserIdSchema,
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type FriendInfo = z.infer<typeof FriendInfoSchema>;
