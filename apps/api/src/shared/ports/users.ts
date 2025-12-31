import type { UserId } from "@/shared/ids";

export type User = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export interface UserRepository {
  findByIds(userIds: readonly UserId[]): Promise<readonly User[]>;
  findById(userId: UserId): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  updateDisplayName(userId: UserId, displayName: string): Promise<void>;
  updateUsername(userId: UserId, username: string): Promise<void>;
  updateAvatarUrl(userId: UserId, avatarUrl: string | null): Promise<void>;
}

