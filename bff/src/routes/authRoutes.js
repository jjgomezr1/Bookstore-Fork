import express from "express";

import {
  EVENT_SOURCES,
  EVENT_TYPES,
  RESOURCE_TYPES,
} from "@bookstore/common/config/events";

import { authenticate } from "../middleware/authenticate.js";
import { setBehaviorEvent } from "../middleware/accessLogger.js";

const toPublicUser = (user) => ({
  customerId: user.customer_id,
  firstName: user.first_name,
  lastName: user.last_name,
  email: user.email,
  city: user.city,
  country: user.country,
});

export const createAuthRoutes = ({ authClient, cookieConfig, jwtConfig }) => {
  const router = express.Router();

  const cookieOptions = {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: cookieConfig.path,
  };

  const disableCaching = (res) => res.set("Cache-Control", "no-store");

  router.post("/login", async (req, res) => {
    const response = await authClient.call("Login", { email: req.body?.email });

    req.auth = {
      customerId: response.user.customer_id,
      sessionId: response.session_id,
    };
    req.authState = "authenticated";

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.LOGIN,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.CUSTOMER,
      resourceId: response.user.customer_id,
    });

    res.cookie(cookieConfig.name, response.token, {
      ...cookieOptions,
      maxAge: jwtConfig.ttlSeconds * 1000,
    });

    disableCaching(res);
    res.status(200).json({ user: toPublicUser(response.user) });
  });

  router.get("/me", authenticate, async (req, res) => {
    const user = await authClient.call("GetCurrentUser", {
      customer_id: req.auth.customerId,
    });

    disableCaching(res);
    res.status(200).json({ user: toPublicUser(user) });
  });

  router.post("/logout", async (req, res) => {
    if (req.auth) {
      setBehaviorEvent(req, {
        eventType: EVENT_TYPES.LOGOUT,
        eventSource: EVENT_SOURCES.HTTP,
        resourceType: RESOURCE_TYPES.CUSTOMER,
        resourceId: req.auth.customerId,
      });
    }

    res.clearCookie(cookieConfig.name, cookieOptions);
    disableCaching(res);
    res.status(204).send();
  });

  return router;
};