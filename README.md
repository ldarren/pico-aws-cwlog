# pico-aws-cwlog
A pico sized aws cloudwatch logging library for nodejs

## installation
```
npm i aws-sdk pico-aws-cwlog
```

pico-aws-cwlog required following environment variables
- AWS\_ACCESS\_ID
- AWS\_ACCESS\_KEY
- AWS\_DEFAULT\_REGION

## usage
need to create logger in early of your app lifetime
```javascript
// index.js
const AWS = require('aws-sdk')
const pLog = require('pico-aws-cwlog')

// for additional aws config, see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html
AWS.config.update({
	timeout: 5000
})

// pLog(GroupName, Options)
pLog('main', {
	uploadInterval: 60000, // log sync interval to aws cloudwatch
	uploadBatchSize: 10000, // max log count sync interval
	streams: ['error', 'log'] // number of streams to be created
})

// controller.js
const logger = require('pico-aws-cwlog')('main')
// const logger = require('pico-aws-cwlog')() // if only 1 group

logger.error({code: 400, msg: 'messgae'})
logger.log({debug: 'messgae'})
logger.warn({debug: 'messgae'}) // error, not defined in streams
```

## test
```
npm test
```
