# WEBSOCKETS - Javascript + Node Benchmark Tests

This provides a modularized setup of backend solutions:
- uWebsockets.js
- raw websockets/express
- socket-io
- socket-io + uwebsocket.js

We allow the modularized engines for the above to be benchmarked against each other, so you can get a sense of which is best for your setup.

The two versions with uWebsockets.js allow over double the capacity for higher limits of the hardware.

# Installation
npm install
npm install uNetworking/uWebSockets.js#v20.43.0

Then on one terminal window:
node server.js

And in another terminal window:
node client.js

Go thorugh the options they offer, just remember if client is a socket-io version, the server needs to run a socket-io or socket-io+uwebsocket version.

