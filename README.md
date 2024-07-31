
# EaseDeploy

EaseDeploy is a deployment automation tool designed to streamline the building and deployment of React and Node.js applications from GitHub repositories. It utilizes AWS ECR and ECS for the cloning and building of files, storing the built files in an S3 bucket. It features an integrated Kafka system for log management, and Clickhouse for log storage. Live logs are shown to the user while the files are getting built. After a successful build and deployment, EaseDeploy generates a unique preview URL. A reverse proxy manages user requests for the preview URL. EaseDeploy ensures an effortless deployment experience while providing users with continuous updates throughout the process.



## Features

- Containerized Build: Utilizes AWS ECR and ECS to start a container, clone the repository, and initiate the build process.
- Storage: Stores built files in an S3 bucket.
- Log Management:
    - Kafka Integration: Uses a Kafka producer to send build logs to a Kafka consumer.
    - Log storage: Logs are stored in a Clickhouse database.
    - Live Log Streaming: A socket connection streams live logs to the frontend.
- Preview URL: Upon successful build and deployment, provides a unique preview URL for users.
- File Serving: A reverse proxy handles user requests for the preview URL, fetching and serving the index.js file from the S3 bucket.


## Demo video

[EaseDeploy demo](https://imgur.com/a/cIxiGeI)


## Installation

1. Clone this repository

```bash
  git clone https://github.com/Jeel13/EaseDeploy.git
  cd EaseDeploy
```

2. Install general dependencies in "api-server", "build-server", "client", and "s3-reverse-proxy" by getting into those folders

```bash
  npm install
```

3. Setup Kafka, Clickhouse, PostgreSQL, ECR, ECS and S3 bucket and create .env files accordingly

4. Setup Kafka's ca.pem file in root path of "api-server", "build-server" and "s3-reverse-proxy" by getting into those folders


5. Run "api-server"
```bash
  cd api-server
  node index.js
```  

6. Run "s3-reverse-proxy"
```bash
  cd s3-reverse-proxy
  node index.js
```

7. Run frontend

```bash
  cd client
  npm start
```
## Authors

- [@Jeel13](https://github.com/Jeel13)

