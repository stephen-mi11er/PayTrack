FROM node:24.0.0-alpine

WORKDIR /app

RUN corepack enable

COPY .yarn .yarn
COPY .yarnrc.yml .yarnrc.yml

COPY package.json yarn.lock ./
COPY packages/web/frontend/package.json ./packages/web/frontend/package.json
COPY packages/database/package.json ./packages/database/package.json

RUN yarn install

COPY . .
RUN rm -rf packages/*/dist packages/*/.next