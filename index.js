'use strict'
const AWS = require('aws-sdk')
const pico = require('pico-common')
const pObj = pico.export('pico/obj')
const UID = function(os, cluster){
	return '.' + os.hostname() + '-' + (cluster.worker ? cluster.worker.id : 0)
}(require('os'), require('cluster'))

const debug = process.env.DEBUG ? function(){ console.log.apply(console, arguments) } : function(){}

const PUBLIC_CONFIG = {
	cloudwatch: {
		apiVersion: '2014-03-28'
	},
	streams: [],
	uploadInterval: 60000,
	uploadBatchSize: 50
}

const LOGGERS = {}
const CONTEXTS = []

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

	const log = ctx.log
	ctx.log = {}
	Object.keys(log).forEach(sname => {
		ctx.cw.putLogEvents({
			logEvents: log[sname],
			logGroupName: ctx.groupName,
			logStreamName: sname,
			sequenceToken: ctx.tokens[sname]
		}, (err, res) => {
			if (err) return debug(err)
			ctx.tokens[sname] = res.nextSequenceToken
		})
	})

	ctx.timeoutId = setTimeout(upload, ctx.cfg.uploadInterval, ctx)
}

function checkCond(ctx){
	return (ctx.started && (ctx.cfg.uploadBatchSize <= Object.keys(ctx.log).reduce((size, key) => (size + ctx.log[key].length), 0)))
}

function log(ctx, streamName){
	return function(){
		const arr = ctx.log[streamName] = ctx.log[streamName] || []
		const msg = 1 < arguments.length ? Array.prototype.slice.call(arguments) : arguments[0]
		arr.push({message: msg.charAt ? msg : JSON.stringify(msg), timestamp: Date.now()})

		if (checkCond(ctx)) upload(ctx)
		return 0
	}
}

const Handler = {
	get(ctx, propKey, receiver) {
		return log(ctx, propKey + UID)
	}
}

function Logger(ctx){
	ctx.cfg.streams.forEach(sname => {
		this[sname] = log(ctx, sname + UID)
	})
}

function start(ctx){
	clearTimeout(ctx.timeoutId)
	ctx.started = 1
	if (checkCond(ctx)) upload(ctx)
	else ctx.timeoutId = setTimeout(upload, ctx.cfg.uploadInterval, ctx)
}

function createStreams(ctx, cfg, groupName, createdStreams){
	createdStreams.reduce((acc, stream) => {
		acc[stream.logStreamName] = stream.uploadSequenceToken
		return acc
	}, ctx.tokens)

	const snames = Object.keys(ctx.tokens)

	const diff = cfg.streams.filter(sname => -1 === snames.indexOf(sname + UID))
	let difflen = diff.length
	if (!difflen) return start(ctx)

	diff.forEach(sname => ctx.cw.createLogStream({ logGroupName: groupName, logStreamName: sname + UID }, () => {
		if (0 === --difflen) start(ctx)	
	}))
}

module.exports = function(gname, config){
	if (!gname){
		if (!CONTEXTS.length) throw new Error('Please create a logger before using it')
		return LOGGERS[CONTEXTS[0].groupName]
	}
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
	LOGGERS[gname] = ('undefined' === typeof Proxy ? new Logger(ctx) : new Proxy(ctx, Handler))

	ctx.cw.describeLogStreams({ logGroupName: gname }, (err, res) => {
		if (err) {
			switch(err.code){
			case 'ResourceNotFoundException':
				return ctx.cw.createLogGroup({ logGroupName: gname }, (err, res) => {
					if (err && 'ResourceAlreadyExistsException' !== err.code) return cb(err)
					createStreams(ctx, cfg, gname, res.logStreams || [])
				})
			default:
				return debug(err)
			}
		}
		createStreams(ctx, cfg, gname, res.logStreams)
	})

	return LOGGERS[gname]
}
