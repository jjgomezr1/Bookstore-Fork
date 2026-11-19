import grpc from "@grpc/grpc-js";

import { AppError } from "@bookstore/common/errors/AppError";
import { GRPC_ERROR_METADATA } from "@bookstore/common/errors/grpcStatus";
import {
  ROUND_ROBIN_OPTIONS,
  toDnsTarget,
} from "@bookstore/common/grpc/clientOptions";
import { loadProto } from "@bookstore/common/grpc/loader";

const toAppError = (error) => {
  const metadata = error.metadata;
  const httpStatus = Number(
    metadata?.get(GRPC_ERROR_METADATA.httpStatusKey)?.[0]
  );
  const appCode = metadata?.get(GRPC_ERROR_METADATA.appCodeKey)?.[0];

  if (Number.isInteger(httpStatus) && appCode) {
    return new AppError(error.details || error.message, httpStatus, String(appCode));
  }

  // Catalog did not answer before the deadline expired
  if (error.code === grpc.status.DEADLINE_EXCEEDED) {
    return new AppError(
      "The catalog service did not respond in time",
      504,
      "UPSTREAM_TIMEOUT"
    );
  }

  return new AppError(
    "The catalog service is unavailable",
    503,
    "CATALOG_UNAVAILABLE"
  );
};

// Orders -> Catalog deadline; shorter than BFF -> Orders (8 s) so Orders can answer first.
const DEFAULT_TIMEOUT_MS = 3000;

export const createCatalogClient = ({
  address,
  protoPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  const proto = loadProto(protoPath);
  const client = new proto.catalog.Catalog(
    toDnsTarget(address),
    grpc.credentials.createInsecure(),
    ROUND_ROBIN_OPTIONS
  );

  const unaryCall = (method, request) =>
    new Promise((resolve, reject) => {
      client[method](
        request,
        new grpc.Metadata(),
        { deadline: Date.now() + timeoutMs },
        (error, response) => {
          if (error) {
            reject(toAppError(error));
            return;
          }
          resolve(response);
        }
      );
    });

  const reserveStock = async (items) => {
    const response = await unaryCall("ReserveStock", {
      items: items.map((item) => ({
        book_id: item.bookId,
        quantity: item.quantity,
      })),
    });

    return {
      reservationId: response.reservation_id,
      books: response.books.map((book) => ({
        bookId: book.book_id,
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        unitPrice: book.unit_price,
        quantity: book.quantity,
      })),
    };
  };

  const releaseStock = async ({ reservationId, items }) => {
    const response = await unaryCall("ReleaseStock", {
      reservation_id: reservationId,
      items: items.map((item) => ({
        book_id: item.bookId,
        quantity: item.quantity,
      })),
    });

    return { released: response.released };
  };

  const close = () => {
    client.close();
  };

  return Object.freeze({ reserveStock, releaseStock, close });
};