# Use Amazon Linux 2 as the base image (same as AWS Lambda)
#FROM public.ecr.aws/lambda/provided:al2
# Use the latest AWS Lambda Node.js 18 image as the base - this image does not have yum/apt
FROM public.ecr.aws/lambda/nodejs:20

# Install Node.js
# Set the Node.js version to install
#ENV NODE_VERSION=20.x

# Install Node.js 20
#RUN yum -y update \
#    && curl -sL https://rpm.nodesource.com/setup_$NODE_VERSION | bash - \
#    && yum install -y nodejs \
#    && yum clean all

RUN dnf -y update
RUN dnf install -y jq
RUN dnf install -y npm
RUN dnf install -y unzip

# Confirm the installation of Node.js
RUN node -v && npm -v

RUN npm install -g aws-cdk

# Install Python
RUN dnf install -y python3 python3-pip
RUN python3 -m pip install --upgrade setuptools

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf awscliv2.zip aws

# Verify AWS CLI v2 installation
RUN aws --version

# Create a directory for your Lambda function code
RUN mkdir -p /var/task

# Set the working directory to the Lambda task directory
WORKDIR /var/task

# Add a bootstrap file for the custom runtime
COPY bootstrap /var/runtime/bootstrap

# Ensure the bootstrap file is executable
RUN chmod +x /var/runtime/bootstrap

# Copy the handler JavaScript file into the Lambda's task directory
COPY index.js /var/task/index.js

# Set up the entry point for Lambda (bootstrap handles the execution)
CMD ["/var/runtime/bootstrap"]
