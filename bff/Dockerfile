ARG NODE_IMAGE

FROM ${NODE_IMAGE}

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY bff/package.json bff/package.json

RUN npm ci --omit=dev

COPY packages/common packages/common
COPY proto proto
COPY bff bff

RUN mkdir -p /usr/src/app/logs \
    && chown -R node:node /usr/src/app/logs

USER node

ENV PROTO_ROOT=/usr/src/app/proto

CMD ["node", "bff/src/server.js"]