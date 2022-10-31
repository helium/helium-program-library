FROM node:16

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn install

COPY . .
COPY tsconfig.build.json tsconfig.json

RUN yarn global add typescript
RUN yarn run build

CMD ["node", "lib/index.js"]
