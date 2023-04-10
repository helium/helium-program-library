
docker run -v $(pwd)/migration-docker/data:/data \
           -it \
           --rm \
           --name encrypt \
           migration:latest ./encrypt-keypairs.sh $1
