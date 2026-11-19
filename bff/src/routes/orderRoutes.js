import express from "express";

import {
  EVENT_SOURCES,
  EVENT_TYPES,
  RESOURCE_TYPES,
} from "@bookstore/common/config/events";

import { authenticate } from "../middleware/authenticate.js";
import { setBehaviorEvent } from "../middleware/accessLogger.js";

const toOrderSummary = (order) => ({
  orderId: order.order_id,
  status: order.status,
  totalAmount: order.total_amount,
  orderTimestamp: order.order_timestamp,
  totalQuantity: order.total_quantity,
});

const toOrderItem = (item) => ({
  orderItemId: item.order_item_id,
  bookId: item.book_id,
  isbn: item.isbn,
  title: item.title,
  author: item.author,
  quantity: item.quantity,
  unitPrice: item.unit_price,
  lineTotal: item.line_total,
});

export const createOrderRoutes = ({ ordersClient }) => {
  const router = express.Router();

  const disableCaching = (res) => res.set("Cache-Control", "no-store");

  router.get("/", authenticate, async (req, res) => {
    const response = await ordersClient.call("GetOrders", {
      customer_id: req.auth.customerId,
    });

    disableCaching(res);
    res.status(200).json({ orders: response.orders.map(toOrderSummary) });
  });

  router.get("/:orderId", authenticate, async (req, res) => {
    const response = await ordersClient.call("GetOrderById", {
      customer_id: req.auth.customerId,
      order_id: req.params.orderId,
    });

    disableCaching(res);
    res.status(200).json({
      order: {
        ...toOrderSummary(response.order),
        items: response.items.map(toOrderItem),
      },
    });
  });

  router.post("/", authenticate, async (req, res) => {
    const response = await ordersClient.call("CreateOrder", {
      customer_id: req.auth.customerId,
      items: Array.isArray(req.body?.items) ? req.body.items : [],
    });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.PURCHASE,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.ORDER,
      resourceId: response.order.order_id,
      orderId: response.order.order_id,
      quantity: response.order.total_quantity,
    });

    disableCaching(res);
    res.status(201).json({ order: toOrderSummary(response.order) });
  });

  return router;
};