import { SignJWT } from "jose";
import { env } from "@/shared/env";
import type { UserId } from "@/shared/ids";

export const issueSessionJwt = async (userId: UserId): Promise<string> => {
  const secret = new TextEncoder().encode(env.SESSION_JWT_SECRET);

  // userId だけを含むセッショントークンを発行
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
};
