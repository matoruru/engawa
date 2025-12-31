import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";

export const FriendshipSchema = z.object({
  userId: UserIdSchema,
  friendId: UserIdSchema,
  createdAt: z.date(),
});
export type Friendship = z.infer<typeof FriendshipSchema>;

