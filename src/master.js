var cluster = require('cluster');
var argv;

function log(thing) {
	console.log(process.pid + ' (master): ' + thing);
}

exports.main = function (args) {
	argv = args;
	log('http-timeout: distributed timeouts for http')
	log('MongoDB: ' + argv.m)
	log('Number of workers: ' + argv.w)
	log('HTTP port: ' + argv.p)
	log('HTTPS port: ' + argv.s)
	log('HTTP proxy: ' + (argv.proxyHost ? (argv.proxyHost + ':' + argv.proxyPort) : 'none'))
	log('Peek lock duration [ms]: ' + argv.l)
	log('Peek interval [ms]: ' + argv.i)
	log('Max POST size [bytes]: ' + argv.a)
	log('Max delivery attempts: ' + argv.t)
	log('Max redirects: ' + argv.r)

	cluster.on('death', function (worker) {
		log(new Date() + ' Worker ' + worker.process.pid + ' exited, creating replacement worker.')
		cluster.fork()
	});

	for (var i = 0; i < argv.w; i++) 
		cluster.fork()

	log('http-timeout started. Ctrl-C to terminate.')
}
