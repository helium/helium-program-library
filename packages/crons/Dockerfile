# Specify the base image
FROM node:16-alpine AS BUILD_IMAGE

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn install

COPY src src
COPY tsconfig.build.json tsconfig.json

RUN yarn global add typescript
RUN yarn run build

RUN npm prune --production

FROM node:16-alpine

WORKDIR /usr/src/app

COPY --from=BUILD_IMAGE /usr/src/app/lib ./lib
COPY --from=BUILD_IMAGE /usr/src/app/node_modules ./node_modules

RUN chmod +x ./lib/src/*.js;

CMD ["tail" "-f", "/dev/null"]
