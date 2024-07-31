const express = require('express')
const httpProxy = require('http-proxy')
const {PrismaClient} = require('@prisma/client')
require('dotenv').config();

const app = express()

const PORT = 8000

const proxy = httpProxy.createProxy()

const BASE_PATH = process.env.BASE_PATH

const prisma = new PrismaClient({})

app.use(async (req, res) => {
    const hostname = req.hostname
    const projectId = hostname.split('.')[0]
    
    const project = await prisma.project.findFirst({
        where: {
            subdomain: projectId, 
        },
        select: {
            id: true,
        },
    });
    
    const target = `${BASE_PATH}/${project.id}`

    return proxy.web(req, res, {target: target, changeOrigin: true})
})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'
})

app.listen(PORT, () => console.log(`Reverse proxy running on port ${PORT}`))