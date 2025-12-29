import { jwtVerify } from "jose";
import * as z from "zod";

import { env } from "@/shared/env";
import { type UserId, UserIdSchema } from "@/shared/ids";

const SessionPayloadSchema = z.object({
  userId: UserIdSchema, // サービス内 userId を入れる
});

export const verifySessionJwt = async (token: string): Promise<UserId> => {
  const secret = new TextEncoder().encode(env.SESSION_JWT_SECRET);

  const { payload } = await jwtVerify(token, secret);
  const parsed = SessionPayloadSchema.parse(payload);

  return parsed.userId;
};

export const extractBearer = (authorization?: string): string | undefined => {
  if (!authorization) return undefined;
  const [kind, token] = authorization.split(" ");
  if (kind !== "Bearer") return undefined;
  return token && token.length > 0 ? token : undefined;
};
