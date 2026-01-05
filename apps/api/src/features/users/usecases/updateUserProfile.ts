import * as z from "zod";
import type { UserRepository } from "@/shared/features/users/ports";
import { UserIdSchema } from "@/shared/ids";

export const UpdateUserProfileInputSchema = z.object({
  userId: UserIdSchema,
  displayName: z.string().min(1).max(100).optional(),
  username: z.string().min(1).max(50).optional(),
  avatarUrl: z.url().nullable().optional(),
});
export type UpdateUserProfileInput = z.infer<
  typeof UpdateUserProfileInputSchema
>;

export interface UpdateUserProfileDeps {
  userRepo: UserRepository;
}

export type UpdateUserProfileResult =
  | { kind: "updated" }
  | { kind: "conflict"; reason: "USERNAME_ALREADY_EXISTS" }
  | { kind: "notFound" };

export const makeUpdateUserProfile =
  (deps: UpdateUserProfileDeps) =>
  async (input: UpdateUserProfileInput): Promise<UpdateUserProfileResult> => {
    // ユーザーが存在するか確認
    const user = await deps.userRepo.findById(input.userId);
    if (!user) {
      return { kind: "notFound" };
    }

    // ユーザー名の重複チェック
    if (input.username && input.username !== user.username) {
      const existingUser = await deps.userRepo.findByUsername(input.username);
      if (existingUser && existingUser.id !== input.userId) {
        return { kind: "conflict", reason: "USERNAME_ALREADY_EXISTS" };
      }
    }

    // 更新
    if (input.displayName !== undefined) {
      await deps.userRepo.updateDisplayName(input.userId, input.displayName);
    }
    if (input.username !== undefined) {
      await deps.userRepo.updateUsername(input.userId, input.username);
    }
    if (input.avatarUrl !== undefined) {
      await deps.userRepo.updateAvatarUrl(input.userId, input.avatarUrl);
    }

    return { kind: "updated" };
  };
