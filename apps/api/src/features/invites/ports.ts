import type { UserId } from "@/shared/ids";
import type { Invite, InviteToken } from "./domain";

export interface InvitesRepository {
  // 招待を作成
  create(invite: Invite): Promise<void>;
  
  // トークンで招待を取得
  findByToken(token: InviteToken): Promise<Invite | null>;
  
  // 招待を受け入れる
  accept(token: InviteToken, acceptedBy: UserId): Promise<void>;
}

