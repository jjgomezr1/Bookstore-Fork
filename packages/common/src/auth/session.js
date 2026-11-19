import { randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createSessionTokens = (jwtConfig) => {
  const secretKey = new TextEncoder().encode(jwtConfig.secret);

  const createSessionToken = async (customerId) => {
    const sessionId = randomUUID();

    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: jwtConfig.algorithm, typ: "JWT" })
      .setSubject(customerId)
      .setIssuer(jwtConfig.issuer)
      .setAudience(jwtConfig.audience)
      .setIssuedAt()
      .setExpirationTime(`${jwtConfig.ttlSeconds}s`)
      .sign(secretKey);

    return { token, sessionId };
  };

  const verifySessionToken = async (token) => {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      algorithms: [jwtConfig.algorithm],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      !UUID_PATTERN.test(payload.sub) ||
      !UUID_PATTERN.test(payload.sid)
    ) {
      throw new Error("Session token is missing valid identity claims");
    }

    return {
      customerId: payload.sub,
      sessionId: payload.sid,
    };
  };

  return Object.freeze({ createSessionToken, verifySessionToken });
};

export { UUID_PATTERN };