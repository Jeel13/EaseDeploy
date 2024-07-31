const express = require('express')
const {ECSClient, RunTaskCommand} = require('@aws-sdk/client-ecs')
const {generateSlug} = require('random-word-slugs')
const {Server} = require('socket.io')
const cors = require('cors')
const {PrismaClient} = require('@prisma/client')
const {createClient} = require('@clickhouse/client')
const {Kafka} = require('kafkajs')
const {v4: uuidv4} = require('uuid')
const fs= require('fs')
const path = require('path')
require('dotenv').config();

const app = express()
const PORT = process.env.PORT || 9000
const SOCKET_PORT = process.env.SOCKET_PORT || 9002

const kafka = new Kafka({
    brokers: [process.env.KAFKA_BROKERS],
    clientId: process.env.KAFKA_CLIENT_ID,
    sasl: {
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD,
        mechanism: 'plain'
    },
    ssl: {
        ca: [fs.readFileSync(path.join(__dirname, 'ca.pem'), 'utf-8')]
    }
})

const client= createClient({
    host: process.env.CLICKHOUSE_HOST,
    database: process.env.CLICKHOUSE_DATABASE,
    username: process.env.CLICKHOUSE_USERNAME,
    password: process.env.CLICKHOUSE_PASSWORD
})

const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID
})

const prisma = new PrismaClient({})

const io = new Server({
    cors: '*'
})

io.on('connection', socket => {
    
    socket.on('subscribe', channel => {
       
        socket.join(channel)
        socket.emit('message', `Joined ${channel}\n`)
    })
})

io.listen(SOCKET_PORT, () => console.log(`Socket server running on port ${SOCKET_PORT}`))

const ecsClient = new ECSClient({
    region: process.env.ECS_CLIENT_REGION,
    credentials: {
        accessKeyId: process.env.ECS_CLIENT_ACCESS_KEY,
        secretAccessKey: process.env.ECS_CLIENT_SECRET_ACCESS_KEY
    }
})

const config = {
    CLUSTER:  process.env.ECS_CLUSTER_ARN,
    TASK:  process.env.ECS_TASK_ARN
}

app.use(express.json())
app.use(cors({
    origin: "*"
}))

app.post('/project', async (req, res) => {
    const {name, gitURL} = req.body

    const project = await prisma.project.create({
        data: {
            name,
            gitURL,
            subdomain: generateSlug()
        }
    })

    return res.json({status: 'success', data: {project}})
})

app.post('/deploy', async (req, res) => {
    const {projectId} = req.body

    const project = await prisma.project.findUnique({where: {id: projectId}})

    if(!project)    return res.status(404).json({error: "Project not found"})

    const deployment = await prisma.deployment.create({
        data: {
            project: { connect: {id: projectId}},
            status: 'QUEUED'
        }
    })

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: [process.env.AWS_VPC_SUBNET1, process.env.AWS_VPC_SUBNET2, process.env.AWS_VPC_SUBNET3],
                securityGroups: [process.env.AWS_VPC_SECURITY_GROUP]
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: process.env.ECR_IMAGE_NAME,
                    environment: [
                        {
                            name: 'GIT_REPO_URL', value: project.gitURL
                        },
                        {
                            name: 'PROJECT_ID', value: projectId
                        },
                        {
                            name: 'DEPLOYMENT_ID', value: deployment.id
                        },

                        {
                            name: 'KAFKA_BROKERS', value: process.env.KAFKA_BROKERS
                        },
                        {
                            name: 'KAFKA_CLIENT_ID', value: process.env.KAFKA_CLIENT_ID
                        },
                        {
                            name: 'KAFKA_SASL_USERNAME', value: process.env.KAFKA_SASL_USERNAME
                        },
                        {
                            name: 'KAFKA_SASL_PASSWORD', value: process.env.KAFKA_SASL_PASSWORD
                        },

                        {
                            name: 'S3_CLIENT_REGION', value: process.env.S3_CLIENT_REGION
                        },
                        {
                            name: 'S3_CLIENT_ACCESS_KEY', value: process.env.S3_CLIENT_ACCESS_KEY
                        },
                        {
                            name: 'S3_CLIENT_SECRET_ACCESS_KEY', value: process.env.S3_CLIENT_SECRET_ACCESS_KEY
                        },
                        {
                            name: 'S3_BUCKET_NAME', value: process.env.S3_BUCKET_NAME
                        }
                    ]
                }
            ]
        }
    })

    await ecsClient.send(command)

    return res.json({
        status: 'queued',
        data: {deploymentId: deployment.id}
    })
})

app.get('/logs/:id', async (req, res) => {
    const id= req.params.id
    const logs = await client.query({
        query: `SELECT event_id, deployment_id, log, timestamp FROM log_events WHERE deployment_id={deployment_id:String}`,
        query_params: {
            deployment_id: id
        },
        format: 'JSONEachRow'
    }) 
    const rawLogs = await logs.json()
    return res.json({rawLogs})
})

async function initKafkaConsumer() {
    await consumer.connect();
    await consumer.subscribe({topics: ['container-logs']})
    await consumer.run({
        autoCommit: false,
        eachBatch: async function ({batch, heartbeat, commitOffsetsIfNecessary, resolveOffset}) {
            const messages = batch.messages
            console.log(`Received ${messages.length} messages`)
            for(const message of messages){
                if(!message.value) continue;
                const stringMessage = message.value.toString()
                const {PROJECT_ID, DEPLOYMENT_ID, log} = JSON.parse(stringMessage)
                
                try {
                    const {query_id} = await client.insert({
                        table: 'log_events',
                        values: [{event_id: uuidv4(), deployment_id: DEPLOYMENT_ID, log}],
                        format: 'JSONEachRow'
                    })
                    commitOffsetsIfNecessary(message.offset)
                    resolveOffset(message.offset)
                    await heartbeat()

                    const deployment = await prisma.deployment.findUnique({
                        where: {
                          id: DEPLOYMENT_ID,
                        },
                        include: {
                          project: true, 
                        },
                      });

                    io.to(`logs:${deployment.project.subdomain}`).emit('message', log)

                } catch (error) {
                    console.log(error);
                }
            }
        }
    })
}

initKafkaConsumer()

app.listen(PORT, () => console.log(`Running Api server on Port ${PORT}`))