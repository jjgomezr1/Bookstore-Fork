import { ORDER_STATUSES } from "../config/orderStatuses.js";

export const createOrderService = ({ database, orderRepository, catalogClient, logger }) => {
  const placeOrder = async ({ customerId, items }) => {
    const reservation = await catalogClient.reserveStock(items);

    try {
      const placedOrder = await database.withTransaction(async (client) => {
        const order = await orderRepository.createOrderRecord(
          {
            customerId,
            orderStatus: ORDER_STATUSES.PLACED,
          },
          client
        );

        for (const book of reservation.books) {
          await orderRepository.createOrderItem(
            {
              orderId: order.order_id,
              bookId: book.bookId,
              isbn: book.isbn,
              title: book.title,
              author: book.author,
              quantity: book.quantity,
              unitPrice: book.unitPrice,
            },
            client
          );
        }

        return orderRepository.recalculateOrderTotal(order.order_id, client);
      });

      const totalQuantity = reservation.books.reduce(
        (total, book) => total + book.quantity,
        0
      );

      return {
        ...placedOrder,
        total_quantity: totalQuantity,
      };
    } catch (error) {
      try {
        await catalogClient.releaseStock({
          reservationId: reservation.reservationId,
          items: reservation.books.map((book) => ({
            bookId: book.bookId,
            quantity: book.quantity,
          })),
        });
      } catch (compensationError) {
        logger.error("Stock compensation failed after order failure", {
          reservationId: reservation.reservationId,
          error: compensationError.message,
        });
      }

      throw error;
    }
  };

  return Object.freeze({ placeOrder });
};