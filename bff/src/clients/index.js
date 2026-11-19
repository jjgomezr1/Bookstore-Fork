import { join } from "node:path";

import { loadProto } from "@bookstore/common/grpc/loader";

import { createGrpcClient } from "./grpcClient.js";

// Deadline (ms) of each BFF -> service call; Orders is the longest because it calls Catalog first.
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