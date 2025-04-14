FROM openjdk:11-jre

RUN apt-get update \
    && apt-get -y install \
        pbzip2 \
        wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /
ADD https://github.com/komoot/photon/releases/download/0.6.2/photon-0.6.2.jar /photon.jar
COPY entrypoint.sh /entrypoint.sh

VOLUME /data
EXPOSE 8000

RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
