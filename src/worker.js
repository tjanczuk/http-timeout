var http = require('http')
	, https = require('https')
	, url = require('url')
	, cluster = require('cluster')
	, mongo = require('mongodb')

var argv, httpServer, httpsServer

function log(thing) {
	console.log(process.pid + ': ' + new Date() + ' ' + thing);
}

function httpError(req, res, status, error) {
	log('Status: ' + status + ', Request URL: ' + req.url + ', Error: ' + error)
	try {
		req.resume()
		res.writeHead(status)
		if (error)
			res.end((typeof error === 'string' ? error : JSON.stringify(error)) + '\n')
		else
			res.end()
	}
	catch (e) {
		// empty
	}
}

function deleteEvent(item, reason) {
	httpd.remove({ _id: item._id }, function (err) {
		if (err)
			log('Error deleting event: id: ' + item._id + ', URL: ' + item.url)
		else if (reason)
			log(reason)
	})
}

function deliverEvent(item) {
	if (!item.redirect)
		item.redirect = 0

	var uri = url.parse(item.url)
	var engine;

	if (uri.protocol === 'http:') {
		engine = http
		uri.port = uri.port || 80
	}
	else { // https
		engine = https
		uri.port = uri.port || 443
	}

    var processResponse = function(res) {
        res.on('end', function() {
            if (res.statusCode >= 200 && res.statusCode < 300)
            	deleteEvent(item, 'Delivered: id: ' + item._id + ', URL: ' + item.url + ', attempts: ' + item.attempt)
            else if (res.statusCode === 302 || res.statusCode === 301) {
            	if (item.redirect < argv.r) {
	            	item.url = res.headers['location']
	            	item.redirect++
	            	deliverEvent(item)
	            }
	            else
	            	deleteEvent(item, 'Abandoned (redirects exceeded): id: ' + item._id + ', URL: ' + item.url 
	            		+ ', redirects: ' + item.redirect)
            } 
            else {
	            // other error: let another delivery attempt be made when the lock expires
	            log('Delivery error: id: ' + item._id + ', URL: ' + item.url + ', attempts: ' + item.attempt 
	            	+ ', status: ' + res.statusCode)
	        }
        })
    }

    var processError = function(error) {
		// other error: let another delivery attempt be made when the lock expires
        log('Delivery error: id: ' + item._id + ', URL: ' + item.url + ', attempts: ' + item.attempt + ', error: ' + error)
    }

    if (argv.proxyHost) {
         // HTTPS or HTTP request through HTTP proxy
        http.request({ // establishing a tunnel
			host: argv.proxyHost,
			port: argv.proxyPort,
			method: 'CONNECT',
			path: uri.hostname + ':' + uri.port
        }).on('connect', function(pres, socket, head) {
            if (pres.statusCode !== 200) {
				// let another delivery attempt be made when the lock expires
				log('Delivery error: id: ' + item._id + ', URL: ' + item.url + ', attempts: ' + item.attempt 
					+ ', proxy status: ' + pres.statusCode)
            }
            else 
                var request = engine.request({
                	method: item.method,
                    host: uri.hostname,
                    port: uri.port,
                    path: uri.path,
                    headers: item.headers,
                    socket: socket, // using a tunnel
                    agent: false    // cannot use a default agent
                }, processResponse).on('error', processError)

            	if (item.body)
            		request.end(item.body)
            	else
            		request.end()
        }).on('error', processError).end()
    }
    else {
    	// no proxy 
        var request = engine.get({
        	method: item.method,
	        host: uri.hostname,
	        port: uri.port,
	        path: uri.path,
	        headers: item.headers
        }, processResponse).on('error', processError)

    	if (item.body)
    		request.end(item.body)
    	else
    		request.end()        
    }
}

function processEvent(item) {
	if (item.attempt > argv.t)
		deleteEvent(item, 'Abandoned (attempts exceeded): id: '+ item._id + ', URL: ' + item.url + ', attempts: ' + item.attempt)
	else 
		deliverEvent(item)
}

function peekLockOnce() {
	var now = Date.now()
	httpd.findAndModify(
		{ due: { $lt: now }},									// all items that are overdue
		[[ 'due', 'asc' ]],										// sort from more overdue to less overdue
		{ $set: { due: argv.l + now }, $inc: { attempt: 1 }},	// lock for the duration of the lock timeout, increase # of attempts
		{ new: true },											// get item with new values
		function (err, item) {
			if (err)
				log('Error polling database: ' + JSON.stringify(err))
			else if (item)
				processEvent(item)
		})

	schedulePeekLock()
}

function schedulePeekLock() {
	setTimeout(peekLockOnce, argv.i * argv.w * Math.random())
}

function registerEvent(ctx) {
	delete ctx.event.hasParams;
	ctx.event.due = Date.now() + ctx.event.delay * 1000
	ctx.event.attempt = 0
	for (var i in ctx.event)
		if (!ctx.event[i])
			delete ctx.event[i]

	httpd.insert(ctx.event, function (err) {
		if (err)
			return httpError(ctx.req, ctx.res, 500, 'Error persisting: ' + err)
		else {
			log('Registered: URL: ' + ctx.event.url + ', Delay: ' + ctx.event.delay)
			ctx.res.writeHead(200, { 'Cache-Control': 'no-cache' })
			ctx.res.end()			
		}
	})
}

function validateInput(ctx) {
	if (typeof ctx.event.url !== 'string')
		return httpError(ctx.req, ctx.res, 400, "The 'url' parameter must be specified.")

	if (typeof ctx.event.delay !== 'string')
		return httpError(ctx.req, ctx.res, 400, "The 'delay' parameter must be specified.")

	if (!ctx.event.method)
		ctx.event.method = 'POST'

	if (!['POST', 'GET', 'PUT', 'DELETE'].some(function (item) { return item === ctx.event.method }))
		return httpError(ctx.req, ctx.res, 400, "The 'method' parameter must be GET, POST, PUT, or DELETE.")

	if (ctx.event.body && ctx.event.method !== 'POST' && ctx.event.method !== 'PUT')
		return httpError(ctx.req, ctx.res, 400, "If the 'body' parameters is specified, the 'method' parameter must be POST or PUT.")

	if (ctx.event.headers) {
		if (typeof ctx.event.headers !== 'object')
			return httpError(ctx.req, ctx.res, 400, "If the 'headers' parameters is specified, it must be a JSON object.")

		for (var h in ctx.event.headers)
			if (typeof ctx.event.headers[h] !== 'string')
				return httpError(ctx.req, ctx.res, 400, "Each property value of the 'headers' object must be a string.")
	}

	var uri = url.parse(ctx.event.url)

	if (uri.protocol !== 'http:' && uri.protocol !== 'https:')
		return httpError(ctx.req, ctx.res, 400, "The 'url' parameter must specify HTTP or HTTPS protocol.")

	if (!uri.hostname || uri.hostname === '')
		return httpError(ctx.req, ctx.res, 400, "The 'url' parameter must specify absolute URL.")

	ctx.event.delay = parseInt(ctx.event.delay)

	if (isNaN(ctx.event.delay) || ctx.event.delay <= 0)
		return httpError(ctx.req, ctx.res, 400, "The 'delay' parameter must be a positive integer.")

	registerEvent(ctx)
}

function filterParams(input) {
	var result = {};
	['url', 'delay', 'method', 'body', 'headers'].forEach(function (item) {
		result[item] = input[item]
		if (input[item])
			result.hasParams = true
	})
	return result
}

function processRequest(req, res) {
	if (req.url === '/favicon.ico') 
		return httpError(req, res, 404)

	if (req.method !== 'POST' && req.method !== 'GET')
		return httpError(req, res, 400, "Only GET or POST methods are accepted.")

	// probe for parameters in the query string first

	var query = url.parse(req.url, true).query

	var ctx = {
		req: req, 
		res: res, 
		event: filterParams(query)
	}

	// if no parameters are specified in the query string, try in the body of the POST request

	if (!ctx.event.hasParams && req.method === 'POST') {
		var body = '';
		var lenth = 0;
		req.on('data', function (chunk) {
			length += chunk.length;
			if (length > argv.a) {
				req.removeAllListeners()
				return httpError(req, res, 400, 'The size of the POST request exceeded the quota of ' + argv.s + ' bytes.')
			}
			body += chunk;
		})
		.on('end', function () {
			var json
			try {
				json = JSON.parse(body)
				if (typeof json !== 'object') throw 'Not an object'
			}
			catch (e) {
				return httpError(req, res, 400, 'The POST request body must be a JSON object.')
			}
			
			ctx.event = filterParams(json)
			validateInput(ctx)
		})
	}
	else 
		validateInput(ctx)
}

function createListeners() {
	try {
		httpServer = http.createServer(processRequest).listen(argv.p)
	} 
	catch (e) {
		log('Unable to listen for HTTP on port ' + argv.p)
		process.exit()
	}

	try {
		httpsServer = https.createServer({ cert: argv.cert, key: argv.key }, processRequest).listen(argv.s)
	}
	catch (e) {
		log('Unable to listen for HTTPS on port ' + argv.s)
		process.exit()
	}

	schedulePeekLock()
}

function loadHttpdCollection() {
	db.collection('httpd', function (err, result) {
		if (err) {
			log('Unable to access httpd collection in the DB ' + argv.m)
			process.exit()
		}
		httpd = result;
		createListeners();
	})	
}

function connectDatabase() {
	mongo.connect(argv.m, {}, function (err, result) {
		if (err) {
			log('Unable to connect to MongoDB at ' + argv.m)
			process.exit()
		}
		db = result
		loadHttpdCollection()
	})
}

exports.main = function(args) {
	argv = args
	connectDatabase()
}
