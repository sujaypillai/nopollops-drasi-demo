FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace @nopollops/api

FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace @nopollops/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/package.json apps/api/package.json
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
