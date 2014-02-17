#!/usr/bin/env node
// tcp-to-http-to-tcp server
//
// +--------------+
// |  tcp client  |
// +--------------+
//        v
// +--------------+
// | http client  | (client.js)
// | & tcp server |
// +--------------+
//        v
// +==============+
// | http server  | (server.js) (this script)
// | & tcp client |
// +==============+
//        v
// +--------------+
// |  tcp server  |
// +--------------+

const config = {
  // http server address and port
  bind: {
    port: 8080,
    host: '0.0.0.0'
  },
  // url to net.connect options map
  urlConnectMap: {
    '/ssh': {
      host: '127.0.0.1',
      port: 22
    },
    '/web': {
      host: '127.0.0.1',
      port: 80
    }
  },
  // log filename
  log: '/dev/stderr',
  // http header which contains client ip address, useful with nginx
  addressHeader: 'client_ip',
  // handshake message. handshake.client will be verified
  handshake: {
    client: process.env.HANDSHAKE || '<',
    server: '>'
  }
};

var http = require('http');
var net = require('net');
var fs = require('fs');

var log = function(message) {
  if (config.log) {
    fs.writeFile(config.log, Date.now() + ' ' + message + '\n', {flag: 'a'});
  }
};

var server = http.createServer(function(req, res) {
  var addr = req.headers[config.addressHeader] || req.connection.remoteAddress;
  var identity = addr + ',' + req.connection._handle.fd;
  var connConfig = config.urlConnectMap[req.url];
  var conn = null;

  if (req.headers['transfer-encoding'] !== 'chunked') {
    res.writeHead(403);
    res.end();
    log('Not chunked: ' + identity + ' ' + req.url);
    return;
  }

  if (connConfig) {
    connConfig = JSON.parse(JSON.stringify(connConfig));
    // Map address to 127.0.0.0/8 IP range. This allows
    // sshguard to be effective
    var match = addr.match(/^(\d+\.\d+\.\d+)\.\d+$/);
    if (match) {
      connConfig.localAddress = '127.' + match[1];
    }
  } else {
    res.writeHead(404);
    res.end();
    log('Not found: ' + identity + ' ' + req.url);
    return;
  }

  var dataHandler = function(data) {
    if (data.length === config.handshake.client.length 
        && data.toString() === config.handshake.client) {
      req.removeListener('data', dataHandler);

      // connect to tcp service
      conn = net.connect(connConfig);
      conn.on('end', function(e) { 
        res.end();
        log('Disconnected (tcp): ' + identity);
      });
      conn.on('error', function(e) {
        res.end();
        log('Error (tcp): ' + identity + ' (' + e.message + ')');
      });
      conn.on('data', function(data) {
        if (data.length > 0) {
          res.write('[' + data.toString('base64') + ']');
          res.write('\n'); // flush
        }
      });

      var buf = '';
      req.on('data', function(data) {
        buf += data.toString().replace(/\n/g, '');
        while (true) {
          var start = buf.indexOf('[');
          var end = buf.indexOf(']');
          if (start > 0) {
            // something bad happens
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
      res.end();
      log('Handshake failed: ' + identity);
    }
  };
  req.on('data', dataHandler);

  req.on('close', function(err) {
    if (conn) {
      conn.end();
    }
    log('Disconnected (http): ' + identity);
  });

  res.writeHead(200, {
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Transfer-Encoding': 'chunked'
  });
  res.write(config.handshake.server);

  log('Connected: ' + identity);
});

server.setTimeout(0);
server.on('error', function(e) {
  console.error(e.message);
  process.exit(1);
});
server.listen(config.bind.port, config.bind.host, function() {
  log('HTTP ' + config.bind.host + ':' +config.bind.port + ' -> TCP ');
});

