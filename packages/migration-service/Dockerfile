FROM node:22-alpine AS BUILD_IMAGE

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn install --immutable

COPY src src
COPY tsconfig.build.json tsconfig.json

RUN yarn run build
RUN npm prune --production

FROM node:22-alpine

WORKDIR /usr/src/app

COPY --from=BUILD_IMAGE /usr/src/app/lib ./lib
COPY --from=BUILD_IMAGE /usr/src/app/node_modules ./node_modules

# This isn't actually used, service is read only. But anchor wants a wallet.
RUN echo "[124,96,181,146,132,165,175,182,60,194,167,230,29,91,110,109,226,38,41,155,207,186,24,33,205,120,108,98,218,67,77,95,13,60,79,204,253,10,183,101,60,94,220,177,117,97,16,29,31,124,35,65,121,147,161,114,159,23,207,202,122,164,170,201]" > id.json

ENV ANCHOR_WALLET=/usr/src/app/id.json

CMD ["yarn", "node", "lib/index.js"]
