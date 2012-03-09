# Distributed timeouts for HTTP

Http-timeout is to HTTP what ```setTimeout``` is to JavaScript. 

It is great for triggering timed events in a distributed system:

- Http-timeout is an HTTP server that allows you to register HTTP requests to made at a later time.
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

