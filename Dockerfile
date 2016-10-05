FROM mhart/alpine-node:6

COPY . /code

WORKDIR /code

RUN npm install && \
    npm install -g typings grunt grunt-cli

RUN grunt compile

RUN rm -rf /code/node_modules/rx-amqplib/src

ENTRYPOINT ["node", "dist/main.js"]
