var http = require('http')

http.createServer(function (req, res) {
	console.log(new Date() + ': ' + req.url)
	res.writeHead(200)
	res.end()

	// do whatever works needs doing here...

}).listen(process.env.PORT || 8000)

console.log('worker listening on http://localhost:' + (process.env.PORT || 8000))