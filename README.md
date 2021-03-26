![Archived](https://img.shields.io/badge/Current_Status-archived-blue?style=flat)

# spews-importer-obm

Tool to import data to OBM using its provisioning API, requires a OBM version >= 3.2.1.

## Install

Requires: node v5.12.0 (or greater), typings v1.5.0

Clone this repository then do:
```sh
npm install -g grunt-cli typings
npm install
typings install
```

## Commands
```sh
grunt lint # search for syntax or code style problems
grunt test # launch tests
grunt compile # transpile TS code to JS code and place it in the 'dist' folder
grunt # do the three commands above in this order
```

## Run it with docker

Have a recent Docker (tested with Docker 1.12.2) then start a rabbitmq instance:
```sh
docker run -d --name spews-rabbit rabbitmq:3-management
```

The second thing is to build the image with:
```sh
docker build -t spews-importer-obm .
```

You can see the usage details by running it without any argument:
```sh
docker run --rm spews-importer-obm
```

You can also test the connection to RabbitMQ with:
```sh
docker run --rm --link spews-rabbit:mq spews-importer-obm test-amqp-connection --amqp_host amqp://mq
```

Create the log output folder (we will mount it as a volume in the container later)
```sh
mkdir ./importer-log
```

Find the OBM_DOMAIN_UUID to target, you can search it in the database or use a curl command like:
```sh
curl -u admin0@global.virt:admin http://OBM_TARGET/provisioning/v1/domains/
```

To start the migration run:
```sh
docker run -v $PWD/importer-log:/code/log/ --link spews-rabbit:mq spews-importer-obm import --amqp_host amqp://mq https://OBM_TARGET/provisioning/v1/ OBM_DOMAIN_UUID
```

The program will now listen to the "spews-rabbit" queues and forward data to import to the OBM's provisioning API.
