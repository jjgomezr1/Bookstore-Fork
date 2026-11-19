import { parse } from "cookie";

export const createSessionContext = ({ cookieName, sessionTokens }) =>
  async (req, res, next) => {
    void res;

    req.auth = undefined;
    req.authState = "anonymous";

    const cookies = parse(req.headers.cookie ?? "");
    const token = cookies[cookieName];

    if (!token) {
      next();
      return;
    }

    try {
      req.auth = await sessionTokens.verifySessionToken(token);
      req.authState = "authenticated";
    } catch {
      req.authState = "invalid";
    }

    next();
  };