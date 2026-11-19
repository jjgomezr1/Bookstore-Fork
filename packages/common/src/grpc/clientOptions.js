// Client-side load balancing for gRPC.
//
// gRPC keeps ONE long-lived HTTP/2 connection per client, so a regular
// Kubernetes Service (which balances per connection) would send every
// call to a single pod. To spread calls across all replicas:
//   1. the Kubernetes Service must be headless (clusterIP: None), so
//      DNS returns the IP of every pod;
//   2. the client must resolve names with the "dns:///" scheme;
//   3. the client must use the round_robin policy (default is pick_first).

const DNS_SCHEME = "dns:///";

// "catalog:50051" -> "dns:///catalog:50051". An address that already
// starts with "dns:" is left as it is.
export const toDnsTarget = (address) =>
  address.startsWith("dns:") ? address : `${DNS_SCHEME}${address}`;

export const ROUND_ROBIN_OPTIONS = Object.freeze({
  "grpc.service_config": JSON.stringify({
    loadBalancingConfig: [{ round_robin: {} }],
  }),
});
