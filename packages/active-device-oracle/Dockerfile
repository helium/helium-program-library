FROM node:22-alpine

WORKDIR /usr/src/app

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.deploy.lock ./

RUN yarn set version 3.6.4
ENV YARN_LOCKFILE_FILENAME=yarn.deploy.lock
RUN yarn install --immutable

COPY src src
COPY tsconfig.build.json tsconfig.json

RUN yarn run build

CMD ["yarn", "node", "lib/src/index.js"]
