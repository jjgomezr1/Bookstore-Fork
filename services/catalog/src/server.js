import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import grpc from "@grpc/grpc-js";

import {
  loadAppSection,
  loadGrpcServerSection,
  loadDatabaseSection,
  loadBooksSection,
} from "@bookstore/common/config/env";
import { createLogger } from "@bookstore/common/config/logger";
import { createDatabase } from "@bookstore/common/db/pool";
import { loadProto } from "@bookstore/common/grpc/loader";

import { createBookRepository } from "./repositories/bookRepository.js";
import { createStockService } from "./services/stockService.js";
import { createCatalogHandlers } from "./handlers/catalogHandlers.js";

const here = dirname(fileURLToPath(import.meta.url));
const protoPath =
  process.env.CATALOG_PROTO_PATH ??
  join(here, "..", "..", "..", "proto", "catalog.proto");

const app = loadAppSection();
const grpcServer = loadGrpcServerSection();
const databaseConfig = loadDatabaseSection();
const booksConfig = loadBooksSection();

const logger = createLogger(app);
const database = createDatabase(databaseConfig);
const bookRepository = createBookRepository(database);
const stockService = createStockService({ database, bookRepository });

const handlers = createCatalogHandlers({
  config: { books: booksConfig },
  bookRepository,
  stockService,
  logger,
});

const proto = loadProto(protoPath);
const server = new grpc.Server();
server.addService(proto.catalog.Catalog.service, handlers);

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

  await database.close();
  logger.info("Shutdown completed", { signal });
  process.exit(0);
};

const start = async () => {
  await database.verifyConnection();

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