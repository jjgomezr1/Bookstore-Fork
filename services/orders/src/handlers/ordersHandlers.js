import { AppError } from "@bookstore/common/errors/AppError";
import { grpcHandler } from "@bookstore/common/errors/grpcStatus";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireCustomerId = (rawCustomerId) => {
  if (typeof rawCustomerId !== "string" || !UUID_PATTERN.test(rawCustomerId)) {
    throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
  }

  return rawCustomerId;
};

const normalizeOrderId = (rawOrderId) => {
  if (typeof rawOrderId !== "string") {
    throw new AppError("orderId is invalid", 400, "INVALID_ORDER_ID");
  }

  const orderId = rawOrderId.trim().toLowerCase();

  if (!UUID_PATTERN.test(orderId)) {
    throw new AppError("orderId is invalid", 400, "INVALID_ORDER_ID");
  }

  return orderId;
};

const toOrderSummary = (order) => ({
  order_id: order.order_id,
  status: order.order_status,
  total_amount: order.total_amount,
  order_timestamp: order.order_timestamp
    ? order.order_timestamp.toISOString()
    : "",
  total_quantity: order.total_quantity ?? 0,
});

const toOrderItem = (item) => ({
  order_item_id: item.order_item_id,
  book_id: item.book_id,
  isbn: item.isbn,
  title: item.title,
  author: item.author,
  quantity: item.quantity,
  unit_price: item.unit_price,
  line_total: item.line_total,
});

export const createOrdersHandlers = ({ config, orderRepository, orderService, logger }) => {
  const normalizeItems = (rawItems) => {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError("The order must contain at least one item", 400, "INVALID_ORDER");
    }

    if (rawItems.length > config.orders.maxDistinctItems) {
      throw new AppError(
        `The order cannot contain more than ${config.orders.maxDistinctItems} distinct items`,
        400,
        "INVALID_ORDER"
      );
    }

    const seenBookIds = new Set();

    return rawItems.map((rawItem) => {
      if (!rawItem || typeof rawItem !== "object") {
        throw new AppError("Every order item is invalid", 400, "INVALID_ORDER");
      }

      if (typeof rawItem.book_id !== "string") {
        throw new AppError("book_id is invalid", 400, "INVALID_ORDER");
      }

      const bookId = rawItem.book_id.trim().toLowerCase();

      if (!bookId || !UUID_PATTERN.test(bookId)) {
        throw new AppError("book_id is invalid", 400, "INVALID_ORDER");
      }

      if (seenBookIds.has(bookId)) {
        throw new AppError(
          "The same book cannot appear more than once in an order",
          400,
          "INVALID_ORDER"
        );
      }

      seenBookIds.add(bookId);

      if (
        !Number.isInteger(rawItem.quantity) ||
        rawItem.quantity <= 0 ||
        rawItem.quantity > config.orders.maxQuantityPerItem
      ) {
        throw new AppError(
          `quantity must be an integer between 1 and ${config.orders.maxQuantityPerItem}`,
          400,
          "INVALID_ORDER"
        );
      }

      return { bookId, quantity: rawItem.quantity };
    });
  };

  const createOrder = async (call) => {
    const customerId = requireCustomerId(call.request.customer_id);
    const items = normalizeItems(call.request.items);

    const order = await orderService.placeOrder({ customerId, items });

    return { order: toOrderSummary(order) };
  };

  const getOrders = async (call) => {
    const customerId = requireCustomerId(call.request.customer_id);
    const orders = await orderRepository.findOrdersByCustomerId(customerId);

    return { orders: orders.map(toOrderSummary) };
  };

  const getOrderById = async (call) => {
    const customerId = requireCustomerId(call.request.customer_id);
    const orderId = normalizeOrderId(call.request.order_id);

    const order = await orderRepository.findOrderByIdForCustomer({ orderId, customerId });

    if (!order) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const items = await orderRepository.findOrderItemsByOrderId(orderId);

    return {
      order: toOrderSummary(order),
      items: items.map(toOrderItem),
    };
  };

  return {
    CreateOrder: grpcHandler(logger, createOrder),
    GetOrders: grpcHandler(logger, getOrders),
    GetOrderById: grpcHandler(logger, getOrderById),
  };
};