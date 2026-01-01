import type { UserId } from "@/shared/ids";
import type { FriendInfo } from "./domain";

export interface FriendshipsRepository {
  // 友達関係を追加
  addFriendship(userId: UserId, friendId: UserId): Promise<void>;
  
  // 友達関係を削除
  removeFriendship(userId: UserId, friendId: UserId): Promise<void>;
  
  // 友達関係が存在するかチェック
  isFriend(userId: UserId, friendId: UserId): Promise<boolean>;
  
  // ユーザーの友達一覧を取得
  listFriends(userId: UserId): Promise<readonly FriendInfo[]>;
}

