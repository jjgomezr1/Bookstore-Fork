import { join } from "node:path";

import { loadProto } from "@bookstore/common/grpc/loader";

import { createGrpcClient } from "./grpcClient.js";

export const createServiceClients = ({ protoRoot, addresses }) => {
  const authProto = loadProto(join(protoRoot, "auth.proto"));
  const catalogProto = loadProto(join(protoRoot, "catalog.proto"));
  const ordersProto = loadProto(join(protoRoot, "orders.proto"));
  const eventsProto = loadProto(join(protoRoot, "events.proto"));

  const auth = createGrpcClient({
    ServiceCtor: authProto.auth.Auth,
    address: addresses.auth,
    serviceName: "authentication",
  });

  const catalog = createGrpcClient({
    ServiceCtor: catalogProto.catalog.Catalog,
    address: addresses.catalog,
    serviceName: "catalog",
  });

  const orders = createGrpcClient({
    ServiceCtor: ordersProto.orders.Orders,
    address: addresses.orders,
    serviceName: "orders",
  });

  const events = createGrpcClient({
    ServiceCtor: eventsProto.events.Events,
    address: addresses.events,
    serviceName: "events",
  });

  const closeAll = () => {
    auth.close();
    catalog.close();
    orders.close();
    events.close();
  };

  return Object.freeze({ auth, catalog, orders, events, closeAll });
};