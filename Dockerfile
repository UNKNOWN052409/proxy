FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV GATEWAY_HOST=0.0.0.0
ENV GATEWAY_PORT=2018

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY bin ./bin
COPY src ./src
COPY docs/GATEWAY.md docs/DEPLOYMENT.md README.md ./docs/

EXPOSE 2018
USER node
ENTRYPOINT ["node", "src/gateway-server.js"]
