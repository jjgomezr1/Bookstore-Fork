ARG NODE_IMAGE

FROM ${NODE_IMAGE}

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/package.json
COPY services/auth/package.json services/auth/package.json

RUN npm ci --omit=dev

COPY packages/common packages/common
COPY proto proto
COPY services/auth services/auth

RUN mkdir -p /usr/src/app/logs \
    && chown -R node:node /usr/src/app/logs

USER node

ENV AUTH_PROTO_PATH=/usr/src/app/proto/auth.proto

CMD ["node", "services/auth/src/server.js"]