FROM amazoncorretto:11

RUN yum install -y \
        pbzip2 \
        wget \
    && yum clean all

WORKDIR /
ADD https://github.com/komoot/photon/releases/download/0.6.2/photon-0.6.2.jar /photon.jar
COPY entrypoint.sh /entrypoint.sh

VOLUME /data
EXPOSE 8000

RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
