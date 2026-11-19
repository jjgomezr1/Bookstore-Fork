import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import grpc from "@grpc/grpc-js";

import {
  loadAppSection,
  loadGrpcServerSection,
  loadAccessLogSection,
  loadClickstreamSection,
} from "@bookstore/common/config/env";
import { createLogger } from "@bookstore/common/config/logger";
import { createClickstreamWriter } from "@bookstore/common/clickstream/writer";
import { createClickstreamFormatter } from "@bookstore/common/clickstream/formatter";
import { loadProto } from "@bookstore/common/grpc/loader";

import { createEventsHandlers } from "./handlers/eventsHandlers.js";

const here = dirname(fileURLToPath(import.meta.url));
const protoPath =
  process.env.EVENTS_PROTO_PATH ??
  join(here, "..", "..", "..", "proto", "events.proto");

const app = loadAppSection();
const grpcServer = loadGrpcServerSection();
const accessLog = loadAccessLogSection();
const clickstreamConfig = loadClickstreamSection();

const logger = createLogger(app);
const clickstreamWriter = createClickstreamWriter({ clickstreamConfig, logger });
const formatter = createClickstreamFormatter({ maxFieldLength: accessLog.maxFieldLength });

const handlers = createEventsHandlers({ clickstreamWriter, formatter, logger });

const proto = loadProto(protoPath);
const server = new grpc.Server();
server.addService(proto.events.Events.service, handlers);

const shutdown = async (signal) => {
  logger.info("Shutdown requested", { signal });

  await new Promise((resolve) => {
    server.tryShutdown((error) => {
      if (error) {
        server.forceShutdown();
      }
      resolve();
    });
  });

  await clickstreamWriter.close();
  logger.info("Shutdown completed", { signal });
  process.exit(0);
};

const start = async () => {
  await clickstreamWriter.initialize();

  await new Promise((resolve, reject) => {
    server.bindAsync(
      grpcServer.bindAddress,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          reject(error);
          return;
        }

        logger.info("gRPC server started", {
          address: grpcServer.bindAddress,
          port,
        });
        resolve();
      }
    );
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