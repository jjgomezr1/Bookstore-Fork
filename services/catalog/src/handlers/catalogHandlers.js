import { AppError } from "@bookstore/common/errors/AppError";
import { grpcHandler } from "@bookstore/common/errors/grpcStatus";

const EMPTY_STRING = "";

const toBookMessage = (book) => ({
  book_id: book.book_id,
  isbn: book.isbn,
  title: book.title,
  author: book.author,
  description: book.description ?? EMPTY_STRING,
  category: book.category ?? EMPTY_STRING,
  publisher: book.publisher ?? EMPTY_STRING,
  publication_year: book.publication_year ?? 0,
  price: book.price,
  stock: book.stock,
  image: book.image ?? EMPTY_STRING,
  created_at: book.created_at ? book.created_at.toISOString() : EMPTY_STRING,
  updated_at: book.updated_at ? book.updated_at.toISOString() : EMPTY_STRING,
});

export const createCatalogHandlers = ({ config, bookRepository, stockService, logger }) => {
  const listBooks = async (call) => {
    const { limit, offset } = call.request;

    const requestedLimit = limit || config.books.defaultLimit;

    if (requestedLimit <= 0 || requestedLimit > config.books.maxLimit) {
      throw new AppError(
        `limit must be between 1 and ${config.books.maxLimit}`,
        400,
        "INVALID_QUERY_PARAMETER"
      );
    }

    const requestedOffset = offset ?? 0;

    if (requestedOffset < 0) {
      throw new AppError(
        "offset must be a non-negative integer",
        400,
        "INVALID_QUERY_PARAMETER"
      );
    }

    const books = await bookRepository.findBooks({
      limit: requestedLimit,
      offset: requestedOffset,
    });

    return { books: books.map(toBookMessage) };
  };

  const getBookByIsbn = async (call) => {
    const isbn = call.request.isbn?.trim();

    if (!isbn) {
      throw new AppError("ISBN is required", 400, "INVALID_ISBN");
    }

    const book = await bookRepository.findBookByIsbn(isbn);

    if (!book) {
      throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
    }

    return toBookMessage(book);
  };

  const reserveStock = async (call) => {
    const rawItems = call.request.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError(
        "The reservation must contain at least one item",
        400,
        "INVALID_RESERVATION"
      );
    }

    const items = rawItems.map((item) => ({
      bookId: item.book_id,
      quantity: item.quantity,
    }));

    const result = await stockService.reserveStock(items);

    return {
      reservation_id: result.reservationId,
      books: result.books.map((book) => ({
        book_id: book.bookId,
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        unit_price: book.unitPrice,
        quantity: book.quantity,
      })),
    };
  };

  const releaseStock = async (call) => {
    const rawItems = call.request.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError(
        "The release must contain at least one item",
        400,
        "INVALID_RELEASE"
      );
    }

    const items = rawItems.map((item) => ({
      bookId: item.book_id,
      quantity: item.quantity,
    }));

    const result = await stockService.releaseStock(items);

    return { released: result.released };
  };

  return {
    ListBooks: grpcHandler(logger, listBooks),
    GetBookByIsbn: grpcHandler(logger, getBookByIsbn),
    ReserveStock: grpcHandler(logger, reserveStock),
    ReleaseStock: grpcHandler(logger, releaseStock),
  };
};