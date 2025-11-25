FROM node:22-alpine AS BUILD_IMAGE

WORKDIR /usr/src/app

RUN mkdir -p .yarn
COPY .yarnrc.yml .yarnrc.yml
COPY .yarn/releases .yarn/releases
COPY package.json ./
COPY yarn.deploy.lock ./

ENV YARN_LOCKFILE_FILENAME=yarn.deploy.lock
RUN yarn install --immutable

COPY src src
COPY tsconfig.build.json tsconfig.json

RUN yarn run build

FROM node:22-alpine

WORKDIR /usr/src/app

COPY --from=BUILD_IMAGE /usr/src/app/lib ./lib
COPY --from=BUILD_IMAGE /usr/src/app/.yarn ./.yarn
COPY --from=BUILD_IMAGE /usr/src/app/node_modules ./node_modules

RUN chmod +x ./lib/src/*.js;

CMD ["tail" "-f", "/dev/null"]
