'use strict'

const AWS = require('aws-sdk')
const pLog = require('./index')

AWS.config.update({
	accessKeyId: process.env.AWS_ACCESS_ID,
	secretAccessKey: process.env.AWS_ACCESS_KEY,
	region: process.env.AWS_DEFAULT_REGION || 'ap-southeast-1',
	timeout: 5000
})

pLog('test.exit', {
	uploadInterval: 60000, // default: 5000
	uploadBatchSize: 10000, // default: 500
	streams: ['error', 'log']
})
pLog('test.batch', {
	uploadInterval: 60000, // default: 5000
	uploadBatchSize: 1, // default: 500
	streams: ['error', 'log']
})
pLog('test.timer', {
	uploadInterval: 100, // default: 5000
	uploadBatchSize: 10000, // default: 500
	streams: ['error', 'log']
})

let logger = pLog() // get first one by default
let result = logger.error({code: 1001, msg: 'exit test error'})
result = result + logger.log('exit test log')

logger = pLog('test.batch')
result = result + logger.error({code: 2001, msg: 'batch test error'})
result = result + logger.log('batch test log')

logger = pLog('test.timer')
result = result + logger.error({code: 3001, msg: 'timer test error'})
result = result + logger.log('timer test log')
setTimeout(() => {
	process.exit(result)
}, 30000)
