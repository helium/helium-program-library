FROM node:18-alpine

WORKDIR /usr/src/app

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.deploy.lock ./
ENV YARN_LOCKFILE_FILENAME=yarn.deploy.lock

RUN corepack enable
RUN yarn set version berry
RUN yarn install

COPY src src
COPY tsconfig.build.json tsconfig.json

RUN yarn run build

CMD ["node", "lib/src/index.js"]
