const path = require('path')
const fs = require('fs')
const {exec} = require('child_process')
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const { Kafka } = require('kafkajs')

const PROJECT_ID = process.env.PROJECT_ID
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID

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

const producer = kafka.producer()

const s3Client = new S3Client({
    region: process.env.S3_CLIENT_REGION,
    credentials: {
        accessKeyId: process.env.S3_CLIENT_ACCESS_KEY,
        secretAccessKey: process.env.S3_CLIENT_SECRET_ACCESS_KEY
    }
})

async function publishLog(log) {
    await producer.send({topic: `container-logs`, messages: [{key: 'log', value: JSON.stringify({PROJECT_ID, DEPLOYMENT_ID, log})}]})
}

async function init() {

    await producer.connect()

    console.log('Executing script.js');
    await publishLog('Build started')
    console.info('Build started')

    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', async function (data) {
        console.log(data.toString());
        await publishLog(data.toString())
    })
    p.stdout.on('error', async function (data) {
        console.log('Error', data.toString());
        await publishLog(`Error: ${data.toString()}`)
    })
    p.on('close', async function () {
        console.log('Build complete')
        await publishLog('Build complete')

        const distFolderPath = path.join(__dirname, 'output', 'dist')

        const distFolderContents = fs.readdirSync(distFolderPath, {recursive: true})

        for (const file of distFolderContents){
            const filePath = path.join(distFolderPath, file)
            if(fs.lstatSync(filePath).isDirectory())    continue
            
            console.log('Uploading file', filePath);
            await publishLog(`Uploading ${filePath}`)

            const command = new PutObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: `__output/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })

            await s3Client.send(command)

            console.info('Uploaded', filePath);
            await publishLog(`Uploaded ${filePath}`)
        }

        console.log('Done');
        await publishLog('Done')
        process.exit(0) 
    })
}

init()
