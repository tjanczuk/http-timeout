# Distributed timeouts for HTTP

Http-timeout is to HTTP what ```setTimeout``` is to JavaScript. 

It is great for triggering timed events in a distributed system:

- Http-timeout is an HTTP server that allows you to register HTTP requests to be made at a later time.
- Pending HTTP reqeusts are stored in a MongoDB database.
- Single instance of http-timeout runs several processes in a cluster to scale on multi-core machines.
- Http-timeout scales out to multiple machines by using the same MongoDB database.
- Peek-lock mechanism ensures a message will be delivered at least once even if an http-timout worker crashes.
- HTTP and HTTPS support, proxy support, re-delivery attempts, and redirect support.

## Prerequisities

- Windows, MacOS, or *nix (tested on Windows 7 & 2008 Server, MacOS Lion, Ubuntu 11.10)
- [node.js v0.7.5 or greater](http://nodejs.org/dist/). 
- [MongoDB](http://www.mongodb.org/downloads). The database is used to store application metadata and must be 
accessible from all backends. (You can also get a free instance up and running quickly at [MongoHQ](https://mongohq.com/home))

## Getting started

Install http-timeout:

```
npm install http-timeout
```

Make sure you are running unsecured MongoDB on localhost:

```
mongod
```

(Alternatively, use the ```-m``` parameter to provide the URL of your MongoDB database when starting http-timeout in the next step).

Start http-timeout:

```
sudo node ./node_modules/http-timeout/src/http-timeout.js
```

Issue a request directing http-timeout to send an HTTP GET request to https://www.google.com in 10 seconds:

```
curl "http://localhost?url=https://www.google.com&method=GET&delay=10"
```

About 10 seconds later, you should see one of the http-timeout worker processes reporting the request had been issued:

```
46706 (master): http-timeout started. Ctrl-C to terminate.
46709: Thu Mar 08 2012 17:11:18 GMT-0800 (PST) Registered: URL: https://www.google.com, Delay: 10
46709: Thu Mar 08 2012 17:11:28 GMT-0800 (PST) Delivered: id: 4f5958b6f607e275b6000001, URL: https://www.google.com, attempts: 1
```

## Using http-timeout

Http-timeout is an HTTP and HTTPS server that expoes web APIs for scheduling HTTP or HTTPS requests to be 
made at a later time. Requests to http-timeout service must use ```GET``` or ```POST``` methods. A ```GET``` 
request must specify request options as URL query parameters. A ```POST``` request can specify request options either 
as URL query parameters or as properties of a JSON object pased in the body of the request. 

Http-timeout accepts the following paramaters:

- ```url``` (required) - an HTTP or HTTPS endpoint to call at a later time.
- ```delay``` (required) - time in seconds to wait before the scheduled HTTP[S] request is made. Http-timeout guarantees 
that the request will be made at least once and not earlier than the scheduled time.
- ```method``` (optional; default is ```POST```) - the HTTP method to use for the request.
- ```body``` (optional; default none) - the entity body of the reqest to issue. It can only be specified with 
```POST``` or ```PUT``` methods.
- ```headers``` (optional; default none) - HTTP request headers to include in the request. This property must be a JSON 
object whose property names are valid HTTP header names and property values are strings. It is best specified in the body 
of the ```POST``` request to http-timeout service. 

For example:

```
http://localhost?url=https://myservice.com&method=POST&body=startBackup&delay=1800
```

Will issue an HTTP POST request to https://myservice.com with the HTTP request body value of ```startBackup``` in about 30 minutes 
from now.  

## Configuring http-timeout

Several configuration options can be specified when starting http-timeout:

```
Usage: node ./http-timeout.js

Options:
  -m, --mongo         Mongo DB connecton string                              [default: "mongodb://localhost/httpd"]
  -w, --workers       Number of worker processes                             [default: 4]
  -p, --port          HTTP listen port                                       [default: 80]
  -s, --sslport       HTTPS listen port                                      [default: 443]
  -c, --cert          Server certificate for SSL                             [default: "./cert.pem"]
  -k, --key           Private key for SSL                                    [default: "./key.pem"]
  -x, --proxy         HTTP proxy in host:port format for outgoing requests   [default: ""]
  -l, --lockDuration  Peek lock duration (milliseconds)                      [default: 20000]
  -i, --peekInterval  Cluster-wide peek interval (milliseconds)              [default: 5000]
  -a, --maxPostSize   Maximum size of a POST request in bytes                [default: 8192]
  -t, --maxAttempts   Maximum number of attempts before abandoning an event  [default: 5]
  -r, --maxRedirects  Maximum number of redirects when delivering the event  [default: 0]
```

The ```-m``` must specify the URL of the MongoDB database to use. By default it expects an unsecured instance to be running 
on localhost. Http-timeout will create a ```httpd``` collection in that database if it does not exist already. 

The ```-w``` option specifies the number of worker processes in a cluser. It defaults to the number of processors on the machine.

The ```-p``` and ```-s``` options specify the listen TCP ports for HTTP and HTTPS requests, respetively. In case of HTTPS, 
server X.509 certificate and assocated private key files in PEM format are provided with ```-c``` and ```-k``` options. 
Sample cert and key file are checked in to get you started, but you will want to replace them with your own for any serious
work. 

The ```-x``` option can be used to specify the HTTP proxy host and port for making outgoing HTTP[S] calls. The format is host:port, 
e.g. ```-x itgproxy:80```. 

The ```-l``` option controls the duration of a peek lock a worker process creaets in the database when picking up requests
that are due for processing. The worker process subsequently has that much time to issue the requests and - if successful - 
permanently remove the entry from the database. In case the worker crashes after picking up overdue requests from the database
or if the requests are unsuaccessful, another attempt to dispatch the requsts will only be made after the lock duration expires. 

The ```-i``` option controls the frequency with which the cluser of http-timeout workers polls the MongoDB database for 
overdue notifications. With the value of 5000ms and 4 workers in the cluser, each worker will statistically poll every 
20 seconds.

The ```-a``` option puts the limit on the maximum size of the HTTP POST request body the http-timeout service will accept. 

The ```-t``` option control how many delivery attempts are made for any single notification. Once this number is exceeded, 
the notification is permanently removed from the database. 

The ```-r``` option controls how many redirects will be followed when issuing notifications. By default reirects are disabled. 
