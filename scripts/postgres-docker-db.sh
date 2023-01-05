#!/bin/bash

docker volume create pgdata
docker run -it --rm -p 5432:5432 --name postgres -e POSTGRES_PASSWORD=postgres -d -v pgdata:/var/lib/postgresql/data postgres:latest

docker logs -f postgres
