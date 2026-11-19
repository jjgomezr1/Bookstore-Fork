import grpc from "@grpc/grpc-js";

import { AppError } from "@bookstore/common/errors/AppError";
import { GRPC_ERROR_METADATA } from "@bookstore/common/errors/grpcStatus";
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

  return new AppError(
    "The catalog service is unavailable",
    503,
    "CATALOG_UNAVAILABLE"
  );
};

export const createCatalogClient = ({ address, protoPath }) => {
  const proto = loadProto(protoPath);
  const client = new proto.catalog.Catalog(
    address,
    grpc.credentials.createInsecure()
  );

  const unaryCall = (method, request) =>
    new Promise((resolve, reject) => {
      client[method](request, (error, response) => {
        if (error) {
          reject(toAppError(error));
          return;
        }
        resolve(response);
      });
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