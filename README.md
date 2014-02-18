node-tcp-via-http
=================

Simple but practical tcp-to-http-to-tcp [node.js](http://nodejs.org/) script.
It's now easy to SSH to a firewalled server with only one HTTP port available.
Just run server.js on the server and run client.js on the client:

      +--------------+
      |  tcp client  | ssh localhost -p 8124
      +--------------+
             v
      +--------------+
      | http client  | client.js //bob:8080/ssh
      | & tcp server |   tcp server at :8124
      +--------------+
             |                     alice
    -------- | ------------------------------------
             v                      bob
      +--------------+ server.js
      | http server  |   http server at :8080
      | & tcp client |     /ssh -> localhost:22
      +--------------+     /foo -> localhost:400
             v
      +--------------+
      |  tcp server  | sshd
      +--------------+


Configuration
-------------
Just modify `config` object in both scripts.


Work with other HTTP services
-----------------------------
You can use a [patched](http://yaoweibin.cn/patches/) [nginx](https://github.com/quark-zju/nginx/tree/req-no-buffer) to route requests to different backends, for example:

    server {
      # ...
      location /ssh {
        # 'proxy_request_buffering' is not supported by official nginx.
        # Check Weibin Yao's patch at http://yaoweibin.cn/patches/
        proxy_read_timeout 3600;
        proxy_request_buffering off;
        client_body_postpone_size 0;
        proxy_buffering off;
        proxy_set_header CLIENT_IP $remote_addr;
        proxy_set_header Transfer-Encoding 'chunked';
        proxy_set_header Connection 'keep-alive';
        proxy_pass http://127.0.0.1:8080;
      }
    }

It's recommended to set `config.bind.host` to `127.0.0.1` under this configuration.


Will sshd see all the connections from 127.0.0.1?
-------------------------------------------------
No for ipv4. server.js will take the advantage of `127.0/8` subnet and change `localAddress` according to the first 3 numbers of the remote ipv4 address.
For example, if the client has the address `123.45.67.8`, sshd will see `127.123.45.67`. This makes [sshguard](https://github.com/schmurfy/sshguard) continue to work to some extent (NOTE: sshguard may have a whitelist, check `/etc/sshguard/whitelist`).
If the request is routed through nginx, `CLIENT_IP` header can be used to specify a real IP address.


Related projects
----------------
* [GNU httptunnel](http://www.nocrew.org/software/httptunnel.html)
