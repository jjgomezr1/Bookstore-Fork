ARG NODE_IMAGE

FROM ${NODE_IMAGE}

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/events/package.json services/events/package.json

RUN npm ci --omit=dev

COPY packages/common packages/common
COPY proto proto
COPY services/events services/events

RUN mkdir -p /usr/src/app/logs \
    && chown -R node:node /usr/src/app/logs

USER node

ENV EVENTS_PROTO_PATH=/usr/src/app/proto/events.proto

CMD ["node", "services/events/src/server.js"]