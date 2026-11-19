import grpc from "@grpc/grpc-js";

import { AppError } from "@bookstore/common/errors/AppError";
import { GRPC_ERROR_METADATA } from "@bookstore/common/errors/grpcStatus";
import {
  ROUND_ROBIN_OPTIONS,
  toDnsTarget,
} from "@bookstore/common/grpc/clientOptions";

const toAppError = (error, serviceName) => {
  const metadata = error.metadata;
  const httpStatus = Number(metadata?.get(GRPC_ERROR_METADATA.httpStatusKey)?.[0]);
  const appCode = metadata?.get(GRPC_ERROR_METADATA.appCodeKey)?.[0];

  if (Number.isInteger(httpStatus) && appCode) {
    return new AppError(error.details || error.message, httpStatus, String(appCode));
  }

  // The service did not answer before the deadline expired
  if (error.code === grpc.status.DEADLINE_EXCEEDED) {
    return new AppError(
      `The ${serviceName} service did not respond in time`,
      504,
      "UPSTREAM_TIMEOUT"
    );
  }

  return new AppError(
    `The ${serviceName} service is unavailable`,
    503,
    "SERVICE_UNAVAILABLE"
  );
};

export const createGrpcClient = ({
  ServiceCtor,
  address,
  serviceName,
  defaultTimeoutMs,
}) => {
  const client = new ServiceCtor(
    toDnsTarget(address),
    grpc.credentials.createInsecure(),
    ROUND_ROBIN_OPTIONS
  );

  // Every call has a deadline: a service that is down or frozen must not hang the request.
  const call = (method, request, timeoutMs = defaultTimeoutMs) =>
    new Promise((resolve, reject) => {
      client[method](
        request,
        new grpc.Metadata(),
        { deadline: Date.now() + timeoutMs },
        (error, response) => {
          if (error) {
            reject(toAppError(error, serviceName));
            return;
          }
          resolve(response);
        }
      );
    });

  const close = () => client.close();

  return Object.freeze({ call, close });
};