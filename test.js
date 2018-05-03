'use strict'

const AWS = require('aws-sdk')
const pLog = require('./index')
AWS.config.update({
  accessKeyId: 'AKIAJO7A56DTSOUCYRQQ',
  secretAccessKey: '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',
  region: 'ap-southeast-1',
  timeout: 5000
})

pLog('exit_test', {
  uploadInterval: 60000, // default: 5000
  uploadBatchSize: 10000, // default: 500
  streams: ['error', 'log']
})
pLog('batch_test', {
  uploadInterval: 60000, // default: 5000
  uploadBatchSize: 1, // default: 500
  streams: ['error', 'log']
})
pLog('timer_test', {
  uploadInterval: 100, // default: 5000
  uploadBatchSize: 10000, // default: 500
  streams: ['error', 'log']
})

let logger = pLog('exit_test')
let result = logger.error({code: 1001, msg: 'exit test error'})
result = result + logger.log('exit test log')

logger = pLog('batch_test')
result = result + logger.error({code: 2001, msg: 'batch test error'})
result = result + logger.log('batch test log')

logger = pLog('timer_test')
result = result + logger.error({code: 3001, msg: 'timer test error'})
result = result + logger.log('timer test log')
setTimeout(() => {
  process.exit(result)
}, 2000)
