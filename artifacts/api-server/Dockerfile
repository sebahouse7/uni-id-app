FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm pkg delete dependencies.@workspace/api-zod && \
    npm pkg delete dependencies.@workspace/db && \
    npm install --omit=dev --ignore-scripts

COPY dist/ ./dist/

EXPOSE 8080

CMD ["node", "dist/index.mjs"]
