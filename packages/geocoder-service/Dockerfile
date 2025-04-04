FROM openjdk:11-jre

RUN apt-get update \
    && apt-get -y install \
        pbzip2 \
        wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
ADD https://github.com/komoot/photon/releases/download/0.6.2/photon-0.6.2.jar /usr/src/app/photon.jar
COPY entrypoint.sh /usr/src/app/entrypoint.sh

VOLUME /usr/src/app/photon_data
EXPOSE 8000

RUN chmod +x /usr/src/app/entrypoint.sh
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
