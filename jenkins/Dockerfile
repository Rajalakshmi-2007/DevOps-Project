# Jenkins with the tools our Jenkinsfile needs: Docker CLI, Python 3, Node.js, Git.
FROM jenkins/jenkins:lts-jdk17
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends docker.io python3 python3-venv python3-pip nodejs curl git \
 && rm -rf /var/lib/apt/lists/*
# Runs as root so it can use the Docker socket. Fine for learning on your own laptop,
# not for a shared or internet-facing server.
