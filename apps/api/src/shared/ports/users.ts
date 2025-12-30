import type { UserId } from "@/shared/ids";

export type User = {
  id: string;
  username: string;
  displayName: string;
};

export interface UserRepository {
  findByIds(userIds: readonly UserId[]): Promise<readonly User[]>;
}

