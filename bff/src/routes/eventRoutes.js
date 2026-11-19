import express from "express";

export const createEventRoutes = ({ eventsClient }) => {
  const router = express.Router();

  router.post("/", async (req, res) => {
    const body = req.body ?? {};

    await eventsClient.call("RecordEvent", {
      event_type: body.event_type,
      resource_type: body.resource_type,
      resource_id: body.resource_id,
      isbn: body.isbn,
      recommendation_id: body.recommendation_id,
      model_version: body.model_version,
      experiment_id: body.experiment_id,
      position: body.position,
      quantity: body.quantity,
      search_query: body.search_query,
      session_id: req.auth?.sessionId,
      request_id: req.requestId,
      customer_id: req.auth?.customerId,
    });

    res.set("Cache-Control", "no-store");
    res.status(204).send();
  });

  return router;
};