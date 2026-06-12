FROM --platform=linux/amd64 ubuntu:22.04

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    openjdk-17-jdk-headless wget unzip curl \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH=$JAVA_HOME/bin:/android-sdk/cmdline-tools/latest/bin:/android-sdk/build-tools/34.0.0:$PATH

# Android SDK
RUN mkdir -p /android-sdk && \
    wget -q "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -O /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-extracted && \
    mkdir -p /android-sdk/cmdline-tools/latest && \
    mv /tmp/cmdline-extracted/cmdline-tools/* /android-sdk/cmdline-tools/latest/ && \
    rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-extracted && \
    yes | /android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/android-sdk "platforms;android-34" "build-tools;34.0.0"

WORKDIR /project
COPY . /project/

CMD ["gradle", "assembleDebug", "--no-daemon"]
