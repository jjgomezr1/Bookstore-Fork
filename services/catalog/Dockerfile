ARG NODE_IMAGE

FROM ${NODE_IMAGE}

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/catalog/package.json services/catalog/package.json

RUN npm ci --omit=dev

COPY packages/common packages/common
COPY proto proto
COPY services/catalog services/catalog

RUN mkdir -p /usr/src/app/logs \
    && chown -R node:node /usr/src/app/logs

USER node

ENV CATALOG_PROTO_PATH=/usr/src/app/proto/catalog.proto

CMD ["node", "services/catalog/src/server.js"]