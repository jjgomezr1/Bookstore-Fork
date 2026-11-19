// Client-side balancing: dns:/// + round_robin spread calls across pods (needs a headless Service).

const DNS_SCHEME = "dns:///";

// "catalog:50051" -> "dns:///catalog:50051"; addresses already starting with "dns:" are kept.
export const toDnsTarget = (address) =>
  address.startsWith("dns:") ? address : `${DNS_SCHEME}${address}`;

export const ROUND_ROBIN_OPTIONS = Object.freeze({
  "grpc.service_config": JSON.stringify({
    loadBalancingConfig: [{ round_robin: {} }],
  }),
});
