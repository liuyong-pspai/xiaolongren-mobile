FROM --platform=linux/amd64 gradle:8.2-jdk17

USER root
RUN mkdir -p /android-sdk && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y wget unzip && \
    wget -q "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -O /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-extracted && \
    mkdir -p /android-sdk/cmdline-tools/latest && \
    mv /tmp/cmdline-extracted/cmdline-tools/* /android-sdk/cmdline-tools/latest/ && \
    rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-extracted && \
    yes | /android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/android-sdk "platforms;android-34" "build-tools;34.0.0" && \
    rm -rf /var/lib/apt/lists/*

ENV ANDROID_HOME=/android-sdk
ENV ANDROID_SDK_ROOT=/android-sdk
WORKDIR /project
COPY . /project/
RUN echo "sdk.dir=/android-sdk" > /project/android/local.properties
CMD cd /project/android && gradle assembleDebug --no-daemon
