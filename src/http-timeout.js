var cluster = require('cluster')
	, fs = require('fs')

var argv = require('optimist')
	.usage('Usage: $0')
	.options('m', {
		alias: 'mongo',
		description: 'Mongo DB connecton string',
		default: 'mongodb://localhost/httpd'
	})
	.options('w', {
		alias: 'workers',
		description: 'Number of worker processes',
		default: require('os').cpus().length
	})
	.options('p', {
		alias: 'port',
		description: 'HTTP listen port',
		default: 80
	})
	.options('s', {
		alias: 'sslport',
		description: 'HTTPS listen port',
		default: 443
	})
	.options('c', {
		alias: 'cert',
		description: 'Server certificate for SSL',
		default: __dirname + '/cert.pem'
	})
	.options('k', {
		alias: 'key',
		description: 'Private key for SSL',
		default: __dirname + '/key.pem'
	})
	.options('x', {
		alias: 'proxy',
		description: 'HTTP proxy in host:port format for outgoing requests',
		default: ''
	})
	.options('l', {
		alias: 'lockDuration',
		description: 'Peek lock duration (milliseconds)',
		default: 20000
	})
	.options('i', {
		alias: 'peekInterval',
		description: 'Cluster-wide peek interval (milliseconds)',
		default: 5000
	})
	.options('a', {
		alias: 'maxPostSize',
		description: 'Maximum size of a POST request in bytes',
		default: 8192
	})
	.options('t', {
		alias: 'maxAttempts',
		description: 'Maximum number of attempts before abandoning an event',
		default: 5
	})
	.options('r', {
		alias: 'maxRedirects',
		description: 'Maximum number of redirects when delivering the event',
		default: 0
	})
	.check(function (args) { return !args.help; })
	.check(function (args) { return args.p != args.s; })
	.check(function (args) {
		args.cert = fs.readFileSync(args.c)
		args.key = fs.readFileSync(args.k)
		return true
	})
	.check(function (args) {
		var proxy = args.x === '' ? process.env.HTTP_PROXY : args.x
		if (proxy) {
		    var i = proxy.indexOf(':')
		    args.proxyHost = i == -1 ? proxy : proxy.substring(0, i)
		    args.proxyPort = i == -1 ? 80 : proxy.substring(i + 1)
		}
		return true;
	})
	.argv

if (cluster.isMaster)
	require('./master.js').main(argv)
else
	require('./worker.js').main(argv)