import protoLoader from "@grpc/proto-loader";
import grpc from "@grpc/grpc-js";

const DEFAULT_OPTIONS = Object.freeze({
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

export const loadProto = (protoPath) => {
  const packageDefinition = protoLoader.loadSync(protoPath, DEFAULT_OPTIONS);
  return grpc.loadPackageDefinition(packageDefinition);
};