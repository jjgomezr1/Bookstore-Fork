import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import grpc from "@grpc/grpc-js";

import {
  loadAppSection,
  loadGrpcServerSection,
  loadGrpcClientAddress,
  loadDatabaseSection,
  loadOrdersSection,
} from "@bookstore/common/config/env";
import { createLogger } from "@bookstore/common/config/logger";
import { createDatabase } from "@bookstore/common/db/pool";
import { loadProto } from "@bookstore/common/grpc/loader";

import { createOrderRepository } from "./repositories/orderRepository.js";
import { createCatalogClient } from "./clients/catalogClient.js";
import { createOrderService } from "./services/orderService.js";
import { createOrdersHandlers } from "./handlers/ordersHandlers.js";

const here = dirname(fileURLToPath(import.meta.url));
const protoRoot = join(here, "..", "..", "..", "proto");
const ordersProtoPath = process.env.ORDERS_PROTO_PATH ?? join(protoRoot, "orders.proto");
const catalogProtoPath = process.env.CATALOG_PROTO_PATH ?? join(protoRoot, "catalog.proto");

const app = loadAppSection();
const grpcServer = loadGrpcServerSection();
const databaseConfig = loadDatabaseSection();
const ordersConfig = loadOrdersSection();
const catalogAddress = loadGrpcClientAddress("CATALOG_GRPC_ADDRESS");

const logger = createLogger(app);
const database = createDatabase(databaseConfig);
const orderRepository = createOrderRepository(database);
const catalogClient = createCatalogClient({
  address: catalogAddress,
  protoPath: catalogProtoPath,
});
const orderService = createOrderService({
  database,
  orderRepository,
  catalogClient,
  logger,
});

const handlers = createOrdersHandlers({
  config: { orders: ordersConfig },
  orderRepository,
  orderService,
  logger,
});

const proto = loadProto(ordersProtoPath);
const server = new grpc.Server();
server.addService(proto.orders.Orders.service, handlers);

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

  catalogClient.close();
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