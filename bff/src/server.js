import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import express from "express";
import cors from "cors";

import {
  loadAppSection,
  loadHttpSection,
  loadCookieSection,
  loadJwtSection,
  loadAccessLogSection,
  loadClickstreamSection,
  loadGrpcClientAddress,
} from "@bookstore/common/config/env";
import { createLogger } from "@bookstore/common/config/logger";
import { createSessionTokens } from "@bookstore/common/auth/session";
import { createClickstreamWriter } from "@bookstore/common/clickstream/writer";
import { createClickstreamFormatter } from "@bookstore/common/clickstream/formatter";
import { AppError } from "@bookstore/common/errors/AppError";

import { createServiceClients } from "./clients/index.js";
import { createSessionContext } from "./middleware/sessionContext.js";
import { createAccessLogger } from "./middleware/accessLogger.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createBookRoutes } from "./routes/bookRoutes.js";
import { createOrderRoutes } from "./routes/orderRoutes.js";
import { createEventRoutes } from "./routes/eventRoutes.js";

const here = dirname(fileURLToPath(import.meta.url));
const protoRoot = process.env.PROTO_ROOT ?? join(here, "..", "..", "proto");

const app = loadAppSection();
const http = loadHttpSection();
const cookieConfig = loadCookieSection();
const jwtConfig = loadJwtSection();
const accessLog = loadAccessLogSection();
const clickstreamConfig = loadClickstreamSection();

const addresses = {
  auth: loadGrpcClientAddress("AUTH_GRPC_ADDRESS"),
  catalog: loadGrpcClientAddress("CATALOG_GRPC_ADDRESS"),
  orders: loadGrpcClientAddress("ORDERS_GRPC_ADDRESS"),
  events: loadGrpcClientAddress("EVENTS_GRPC_ADDRESS"),
};

const logger = createLogger(app);
const sessionTokens = createSessionTokens(jwtConfig);
const clickstreamWriter = createClickstreamWriter({ clickstreamConfig, logger });
const formatter = createClickstreamFormatter({ maxFieldLength: accessLog.maxFieldLength });
const clients = createServiceClients({ protoRoot, addresses });

const expressApp = express();

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || http.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new AppError("Origin is not allowed by CORS policy", 403, "CORS_ORIGIN_DENIED"));
  },
};

expressApp.set("trust proxy", http.trustProxyHops);
expressApp.disable("x-powered-by");

expressApp.use(createAccessLogger({ accessLog, formatter, clickstreamWriter }));
expressApp.use(createSessionContext({ cookieName: cookieConfig.name, sessionTokens }));
expressApp.use(cors(corsOptions));
expressApp.use(express.json({ limit: http.jsonBodyLimit }));

expressApp.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: app.serviceName });
});

expressApp.use(`${http.basePath}/auth`, createAuthRoutes({ authClient: clients.auth, cookieConfig, jwtConfig }));
expressApp.use(`${http.basePath}/books`, createBookRoutes({ catalogClient: clients.catalog }));
expressApp.use(`${http.basePath}/orders`, createOrderRoutes({ ordersClient: clients.orders }));
expressApp.use(`${http.basePath}/events`, createEventRoutes({ eventsClient: clients.events }));

expressApp.use(notFoundHandler);
expressApp.use(createErrorHandler(logger));

let server;

const shutdown = async (signal) => {
  logger.info("Shutdown requested", { signal });

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  clients.closeAll();
  await clickstreamWriter.close();
  logger.info("Shutdown completed", { signal });
  process.exit(0);
};

const start = async () => {
  await clickstreamWriter.initialize();

  server = expressApp.listen(http.port, () => {
    logger.info("HTTP server started", { port: http.port });
  });
};

process.on("SIGTERM", () =>
  shutdown("SIGTERM").catch((error) => {
    logger.error("Graceful shutdown failed", { error: error.message });
    process.exit(1);
  })
);

process.on("SIGINT", () =>
  shutdown("SIGINT").catch((error) => {
    logger.error("Graceful shutdown failed", { error: error.message });
    process.exit(1);
  })
);

start().catch((error) => {
  logger.error("Application failed to start", { error: error.message });
  process.exit(1);
});