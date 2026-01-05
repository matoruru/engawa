const extractSessionCookie = (setCookie: string): string => {
  const m = /(?:^|,\s*)session=([^;]+)/.exec(setCookie);
  if (!m) throw new Error(`Set-Cookie does not include session: ${setCookie}`);
  return `session=${m[1]}`;
};

export const createSessionCookie = async (userId: string): Promise<string> => {
  const res = await fetch(`http://127.0.0.1:3000/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  if (res.status !== 200) throw new Error("failed to create session cookie");

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("missing set-cookie");

  return extractSessionCookie(setCookie);
};
