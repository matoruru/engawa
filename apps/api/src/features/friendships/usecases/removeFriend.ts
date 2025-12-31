import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";
import type { FriendshipsRepository } from "../ports";

export const RemoveFriendInputSchema = z.object({
  userId: UserIdSchema,
  friendId: UserIdSchema,
});
export type RemoveFriendInput = z.infer<typeof RemoveFriendInputSchema>;

export interface RemoveFriendDeps {
  friendshipsRepo: FriendshipsRepository;
}

export type RemoveFriendResult = {
  kind: "removed";
};

export const makeRemoveFriend =
  (deps: RemoveFriendDeps) =>
  async (input: RemoveFriendInput): Promise<RemoveFriendResult> => {
    await deps.friendshipsRepo.removeFriendship(input.userId, input.friendId);
    return { kind: "removed" };
  };

