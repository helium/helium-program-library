FROM openjdk:11-jre

# Install pbzip2 for parallel extraction
RUN apt-get update \
    && apt-get -y install \
        pbzip2 \
        wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /photon
ADD https://github.com/komoot/photon/releases/download/0.6.2/photon-0.6.2.jar /photon/photon.jar
COPY entrypoint.sh ./entrypoint.sh

VOLUME /photon/photon_data
EXPOSE 2322

RUN chmod +x /photon/entrypoint.sh
ENTRYPOINT ["/photon/entrypoint.sh"]
