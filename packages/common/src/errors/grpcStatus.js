import grpc from "@grpc/grpc-js";

import { AppError } from "./AppError.js";

const HTTP_TO_GRPC_STATUS = Object.freeze({
  400: grpc.status.INVALID_ARGUMENT,
  401: grpc.status.UNAUTHENTICATED,
  403: grpc.status.PERMISSION_DENIED,
  404: grpc.status.NOT_FOUND,
  409: grpc.status.FAILED_PRECONDITION,
  422: grpc.status.INVALID_ARGUMENT,
  429: grpc.status.RESOURCE_EXHAUSTED,
  500: grpc.status.INTERNAL,
  503: grpc.status.UNAVAILABLE,
});

const GRPC_METADATA_HTTP_STATUS = "x-http-status";
const GRPC_METADATA_APP_CODE = "x-app-code";

export const toGrpcError = (error, logger) => {
  if (error instanceof AppError) {
    const grpcCode =
      HTTP_TO_GRPC_STATUS[error.statusCode] ?? grpc.status.UNKNOWN;

    const metadata = new grpc.Metadata();
    metadata.set(GRPC_METADATA_HTTP_STATUS, String(error.statusCode));
    metadata.set(GRPC_METADATA_APP_CODE, error.code);

    if (error.statusCode >= 500) {
      logger?.error("Request failed", {
        code: error.code,
        statusCode: error.statusCode,
      });
    }

    return {
      code: grpcCode,
      message: error.message,
      metadata,
    };
  }

  logger?.error("Unhandled service error", {
    error: error?.message,
    stack: error?.stack,
  });

  const metadata = new grpc.Metadata();
  metadata.set(GRPC_METADATA_HTTP_STATUS, "500");
  metadata.set(GRPC_METADATA_APP_CODE, "INTERNAL_SERVER_ERROR");

  return {
    code: grpc.status.INTERNAL,
    message: "Internal Server Error",
    metadata,
  };
};

export const grpcHandler = (logger, handler) => async (call, callback) => {
  try {
    const response = await handler(call);
    callback(null, response);
  } catch (error) {
    callback(toGrpcError(error, logger));
  }
};

export const GRPC_ERROR_METADATA = Object.freeze({
  httpStatusKey: GRPC_METADATA_HTTP_STATUS,
  appCodeKey: GRPC_METADATA_APP_CODE,
});