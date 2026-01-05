import * as z from "zod";
import { UserIdSchema } from "@/shared/ids";

export const UserSchema = z.object({
  id: UserIdSchema,
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
}). transform((user) => ({
  ...user,

  // displayNameが未設定の場合はデフォルト値としてusernameを使用する。
  displayName: user.displayName || user.username,
}));
export type User = z.infer<typeof UserSchema>;
