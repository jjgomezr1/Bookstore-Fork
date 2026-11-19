import grpc from "@grpc/grpc-js";

import { AppError } from "@bookstore/common/errors/AppError";
import { GRPC_ERROR_METADATA } from "@bookstore/common/errors/grpcStatus";

const toAppError = (error, serviceName) => {
  const metadata = error.metadata;
  const httpStatus = Number(metadata?.get(GRPC_ERROR_METADATA.httpStatusKey)?.[0]);
  const appCode = metadata?.get(GRPC_ERROR_METADATA.appCodeKey)?.[0];

  if (Number.isInteger(httpStatus) && appCode) {
    return new AppError(error.details || error.message, httpStatus, String(appCode));
  }

  return new AppError(
    `The ${serviceName} service is unavailable`,
    503,
    "SERVICE_UNAVAILABLE"
  );
};

export const createGrpcClient = ({ ServiceCtor, address, serviceName }) => {
  const client = new ServiceCtor(address, grpc.credentials.createInsecure());

  const call = (method, request) =>
    new Promise((resolve, reject) => {
      client[method](request, (error, response) => {
        if (error) {
          reject(toAppError(error, serviceName));
          return;
        }
        resolve(response);
      });
    });

  const close = () => client.close();

  return Object.freeze({ call, close });
};