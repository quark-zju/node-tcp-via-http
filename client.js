#!/usr/bin/env node
// tcp-to-http-to-tcp client
//
// +--------------+
// |  tcp client  |
// +--------------+
//        v
// +==============+
// | http client  | (client.js) (this script)
// | & tcp server |
// +==============+
//        v
// +--------------+
// | http server  | (server.js)
// | & tcp client |
// +--------------+
//        v
// +--------------+
// |  tcp server  |
// +--------------+

const config = {
  // local tcp server address and port
  bind: {
    port: process.argv[3] || 8124,
    host: '127.0.0.1'
  },
  // remote server.js url
  url: process.argv[2] || 'http://127.0.0.1:8080/ssh',
  // log filename
  log: '/dev/stderr',
  // handshake message. handshake.server will be verified
  handshake: {
    client: process.env.HANDSHAKE || '<',
    server: '>'
  }
};

var http = require('http');
var net = require('net');
var fs = require('fs');
var url = require('url');

var log = function(message) {
  if (config.log) {
    fs.writeFile(config.log, Date.now() + ' ' + message + '\n', {flag: 'a'});
  }
};

var server = net.createServer(function(conn) {
  var identity = conn._handle.fd;
  var parsed = url.parse(config.url);
  var req = http.request({
    hostname: parsed.hostname,
    port: parsed.port,
    path: parsed.path,
    method: 'PUT',
  }, function(res) {
    if (res.headers['transfer-encoding'] !== 'chunked') {
      req.abort();
      conn.end();
      log('Not chunked: ' + identity);
      return;
    }
    var dataHandler = function(data) {
      if (data.length === config.handshake.server.length
          && data.toString() === config.handshake.server) {
        res.removeListener('data', dataHandler);

        conn.on('data', function(data) {
          if (data.length > 0) {
            req.write('[' + data.toString('base64') + ']');
            req.write('\n'); // flush
          }
        });

        var buf = '';
        res.on('data', function(data) {
          buf += data.toString().replace(/\n/g, '');
          while (true) {
            var start = buf.indexOf('[');
            var end = buf.indexOf(']');
            if (start > 0 || (end < start && end >= 0)) {
              // something bad happens
              req.abort();
              conn.end();
              log('Bad packet: ' + identity);
              break;
            } else if (start === 0 && end > start) {
              var decoded = new Buffer(buf.slice(start + 1, end), 'base64');
              conn.write(decoded);
              buf = buf.slice(end + 1);
            } else {
              break;
            }
          }
        });

        log('Handshaked: ' + identity);
      } else {
        req.abort();
        conn.end();
        log('Handshake failed: ' + identity);
      }
    };
    res.on('data', dataHandler);
    res.on('close', function(e) {
      conn.end();
      log('Disconnected (http): ' + identity);
    });
  });
  req.on('error', function(e) { 
    conn.end();
    log('Connect failed (http): ' + identity + ' (' + e.message + ')');
  });
  conn.on('end', function(e) {
    // disconnected by tcp client
    req.abort();
    log('Disconnected (tcp): ' + identity);
  });
  req.write(config.handshake.client);
  log('Connected: ' + identity);
});

server.on('error', function(e) {
  console.error(e.message);
  process.exit(1);
});
server.listen(config.bind.port, config.bind.host, function() {
  log('TCP ' + config.bind.host + ':' + config.bind.port
      + ' -> HTTP ' + config.url);
});

