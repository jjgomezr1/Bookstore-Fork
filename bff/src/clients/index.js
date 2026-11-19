import { join } from "node:path";

import { loadProto } from "@bookstore/common/grpc/loader";

import { createGrpcClient } from "./grpcClient.js";

// Deadline of each BFF -> service call, in milliseconds.
// Orders gets the longest one because it calls Catalog (3 s) before
// answering, so it can still reply with its own error before the BFF
// gives up. Events is fire-and-forget telemetry: it must never slow
// the user down.
const DEADLINES_MS = Object.freeze({
  auth: 2000,
  catalog: 2000,
  orders: 8000,
  events: 500,
});

export const createServiceClients = ({ protoRoot, addresses }) => {
  const authProto = loadProto(join(protoRoot, "auth.proto"));
  const catalogProto = loadProto(join(protoRoot, "catalog.proto"));
  const ordersProto = loadProto(join(protoRoot, "orders.proto"));
  const eventsProto = loadProto(join(protoRoot, "events.proto"));

  const auth = createGrpcClient({
    ServiceCtor: authProto.auth.Auth,
    address: addresses.auth,
    serviceName: "authentication",
    defaultTimeoutMs: DEADLINES_MS.auth,
  });

  const catalog = createGrpcClient({
    ServiceCtor: catalogProto.catalog.Catalog,
    address: addresses.catalog,
    serviceName: "catalog",
    defaultTimeoutMs: DEADLINES_MS.catalog,
  });

  const orders = createGrpcClient({
    ServiceCtor: ordersProto.orders.Orders,
    address: addresses.orders,
    serviceName: "orders",
    defaultTimeoutMs: DEADLINES_MS.orders,
  });

  const events = createGrpcClient({
    ServiceCtor: eventsProto.events.Events,
    address: addresses.events,
    serviceName: "events",
    defaultTimeoutMs: DEADLINES_MS.events,
  });

  const closeAll = () => {
    auth.close();
    catalog.close();
    orders.close();
    events.close();
  };

  return Object.freeze({ auth, catalog, orders, events, closeAll });
};