import { randomUUID } from "node:crypto";

import { AppError } from "@bookstore/common/errors/AppError";

const byBookId = (left, right) => left.bookId.localeCompare(right.bookId);

export const createStockService = ({ database, bookRepository }) => {
  const reserveStock = async (items) =>
    database.withTransaction(async (client) => {
      const orderedItems = [...items].sort(byBookId);
      const bookIds = orderedItems.map((item) => item.bookId);
      const books = await bookRepository.findBooksByIdsForUpdate(bookIds, client);

      if (books.length !== orderedItems.length) {
        throw new AppError(
          "One or more books are no longer available",
          409,
          "BOOK_UNAVAILABLE"
        );
      }

      const booksById = new Map(books.map((book) => [book.book_id, book]));

      for (const item of orderedItems) {
        const book = booksById.get(item.bookId);

        if (!book) {
          throw new AppError(
            "One or more books are no longer available",
            409,
            "BOOK_UNAVAILABLE"
          );
        }

        if (book.stock < item.quantity) {
          throw new AppError(
            `Insufficient stock for ${book.title}`,
            409,
            "INSUFFICIENT_STOCK"
          );
        }
      }

      const reservedBooks = [];

      for (const item of orderedItems) {
        const book = booksById.get(item.bookId);

        const updatedBook = await bookRepository.decreaseBookStock(
          {
            bookId: book.book_id,
            quantity: item.quantity,
          },
          client
        );

        if (!updatedBook) {
          throw new AppError(
            `Insufficient stock for ${book.title}`,
            409,
            "INSUFFICIENT_STOCK"
          );
        }

        reservedBooks.push({
          bookId: book.book_id,
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          unitPrice: book.price,
          quantity: item.quantity,
        });
      }

      return {
        reservationId: randomUUID(),
        books: reservedBooks,
      };
    });

  const releaseStock = async (items) =>
    database.withTransaction(async (client) => {
      const orderedItems = [...items].sort(byBookId);

      for (const item of orderedItems) {
        await bookRepository.increaseBookStock(
          {
            bookId: item.bookId,
            quantity: item.quantity,
          },
          client
        );
      }

      return { released: true };
    });

  return Object.freeze({ reserveStock, releaseStock });
};