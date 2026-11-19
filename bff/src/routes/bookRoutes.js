import express from "express";

import {
  EVENT_SOURCES,
  EVENT_TYPES,
  RESOURCE_TYPES,
} from "@bookstore/common/config/events";

import { setBehaviorEvent } from "../middleware/accessLogger.js";

const toBookResponse = (book) => ({
  book_id: book.book_id,
  isbn: book.isbn,
  title: book.title,
  author: book.author,
  description: book.description,
  category: book.category,
  publisher: book.publisher,
  publication_year: book.publication_year,
  price: book.price,
  stock: book.stock,
  image: book.image,
  created_at: book.created_at,
  updated_at: book.updated_at,
});

export const createBookRoutes = ({ catalogClient }) => {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 0;
    const offset = req.query.offset ? Number.parseInt(req.query.offset, 10) : 0;

    const response = await catalogClient.call("ListBooks", { limit, offset });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.CATALOG_VIEW,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.CATALOG,
    });

    res.status(200).json(response.books.map(toBookResponse));
  });

  router.get("/:isbn", async (req, res) => {
    const book = await catalogClient.call("GetBookByIsbn", { isbn: req.params.isbn });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.BOOK_VIEW,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: book.book_id,
      isbn: book.isbn,
    });

    res.status(200).json(toBookResponse(book));
  });

  return router;
};