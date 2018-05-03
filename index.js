'use strict'
const AWS = require('aws-sdk')
const pico = require('pico-common')
const pObj = pico.export('pico/obj')

const PUBLIC_CONFIG = {
  cloudwatch: {
			apiVersion: '2014-03-28'
  },
  streams: {},
  uploadInterval: 60000,
  uploadBatchSize: 50
}

const LOGGERS = {}
const CONTEXTS = []

function debug(){
	if (!process.env.DEBUG) console.log.apply(console, arguments)
}

function cleanup(err) {
    if (err) debug(err)
    debug('clean up on exit')
		CONTEXTS.forEach(upload)
}

function exit(){
	cleanup()
	process.exit(0)
}

function exception(exp){
	cleanup()
  throw exp
}

// do something when app is closing
process.on('exit', cleanup)
// catches ctrl+c event
process.on('SIGINT', exit)
// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exit)
process.on('SIGUSR2', exit)
// catches uncaught exceptions
process.on('uncaughtException', exception)

function upload(ctx){
	clearTimeout(ctx.timeoutId)
  if (!Object.keys(ctx.tokens).length) {
    // try again in 1 sec
	  return ctx.timeoutId = setTimeout(upload, 1000, ctx)
  }
	ctx.timeoutId = setTimeout(upload, ctx.cfg.uploadInterval, ctx)

	const log = ctx.log
	ctx.log = {}

	Object.keys(log).forEach(sname => {
    ctx.cw.putLogEvents({
      logEvents: log[sname],
      logGroupName: ctx.groupName,
      logStreamName: sname,
      sequenceToken: ctx.tokens[sname] || undefined
    }, (err, res) => {
      if (err) return debug(err)
      ctx.tokens[sname] = res.nextSequenceToken
    })
  })
}

const Handler = {
	get(ctx, propKey, receiver) {
		return function(){
			const arr = ctx.log[propKey] = ctx.log[propKey] || []
			arr.push(1 < arguments.length ? Array.prototype.slice.call(arguments) : arguments[0])
			if (ctx.cfg.uploadBatchSize <= Object.keys(ctx.log).reduce((size, key) => (size + ctx.log[key].length), 0))
				upload(ctx)
			return 0
		}
	}
}

function Logger(ctx){
  ctx.cfg.streams.forEach(sname => {
    this[sname] = function() {
			const arr = ctx.log[sname] = ctx.log[sname] || []
      const msg = 1 < arguments.length ? Array.prototype.slice.call(arguments) : arguments[0]
			arr.push({message: msg.charAt ? msg : JSON.stringify(msg), timestamp: Date.now()})

			if (ctx.cfg.uploadBatchSize <= Object.keys(ctx.log).reduce((size, key) => (size + ctx.log[key].length), 0))
				upload(ctx)
			return 0
    }
  })
}

module.exports = function(gname, config){
	if (LOGGERS[gname]) return LOGGERS[gname]

  const cfg = pObj.extends({}, [ PUBLIC_CONFIG, config ])

  const tokens = {}

  const ctx = {
    groupName: gname,
    cw: new AWS.CloudWatchLogs(cfg.cloudwatch),
    cfg,
    tokens,
    timeoutID: 0,
    log: {}
  }

  CONTEXTS.push(ctx)
  LOGGERS[gname] = cfg.streams.length ? new Logger(ctx) : new Proxy(ctx, Handler)

  ctx.cw.describeLogStreams({ logGroupName: gname }, (err, res) => {
    if (err) {
      switch(err.code){
      case 'ResourceNotFoundException':
        return ctx.cw.createLogGroup({ logGroupName: gname }, (err, res) => {
          if (err && 'ResourceAlreadyExistsException' !== err.code) return cb(err)
          if (!cfg.streams.length) return

          cfg.streams.forEach(sname => ctx.cw.createLogStream({ logGroupName: gname, logStreamName: sname }, () => {}))
        })
      default:
        return debug(err)
      }
    }
    const snames = res.logStreams.map(stream => {
      tokens[stream.logStreamName] = stream.uploadSequenceToken || ''
      return stream.logStreamName
    })
    if (cfg.streams.length) {
      const diff = cfg.streams.filter(sname => -1 === snames.indexOf(sname))
      if (diff.length) diff.forEach(sname => ctx.cw.createLogStream({ logGroupName: gname, logStreamName: sname }, () => {}))
    }
    cfg.streams = snames
  })

  ctx.timeoutId = setTimeout(upload, ctx.cfg.uploadInterval, ctx)

  return LOGGERS[gname]
}
