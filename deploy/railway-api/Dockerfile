FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY dist/ ./dist/
COPY migrate.mjs ./
COPY schema.sql ./

ENV NODE_ENV=production

EXPOSE 8080

CMD ["sh", "-c", "node migrate.mjs && node dist/index.mjs"]
