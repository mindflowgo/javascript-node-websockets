/*******************************************************
 * uWebSockets.js
 * Powerful, fast websocket module for node.
 * 
 * WebSocket methods:
 * https://unetworking.github.io/uWebSockets.js/generated/interfaces/WebSocket.html#UserData
 */
import { App, SHARED_COMPRESSOR } from "uWebSockets.js";

export function serverEngine({ bind, socketAuthenticate, socketOpen, socketClose, socketError, socketDropped, socketMessage, socketSubscription }){
    // give each socket a unique #
    let socketCnt = 0;
    
    // certs
	const certs = {
		cert_file_name: bind.cert,
		key_file_name: bind.key,
	}
    if( typeof(socketError)==='function' ) console.log(`NOTE: socketError not defined in module.`)
        
	App(certs).ws('/*', { /*SSLApp*/
		// settings
		idleTimeout: 32,
		maxBackpressure: 2048,
		maxPayloadLength: 16 * 1024 * 1024,
		// compression: SHARED_COMPRESSOR,

		upgrade: (res, req, context) => { 
			// fail auth, close.
			const namespace = req.getUrl();
			// using the only way we can pass headers in with current spec, using sub-protocol:
			const auth = req.getHeader('sec-websocket-protocol').replace('token,','');
			if( !socketAuthenticate( namespace, auth ) ){
				res.end("401", "HTTP/1.1 401 Unauthorized");
				return;
			}

			res.upgrade({
				// this data accessible later via: socket.getUserData()
				namespace, auth
			},
			/* Spell these correctly */
			req.getHeader('sec-websocket-key'),
			'token', //req.getHeader('sec-websocket-protocol'),
			req.getHeader('sec-websocket-extensions'),
			context);
		},

		open: (socket) =>{ 
			socket.id = '_'+ ++socketCnt;
			const reply = (replyMessage) => socket.send(JSON.stringify({ ...replyMessage, id: socket.id}))
			socketOpen( socket.id,reply );
		},
		
		close: (socket, code, message) => socketClose( socket.id, code, Buffer.from(message).toString() ),

		drain: (socket) => {
			console.log('WebSocket backpressure: ' + socket.getBufferedAmount());
		},
		
		dropped: (socket) => socketDropped( socket.id ),

		subscription: (socket, topic, channelCnt, oldCnt) => {
			// NOTE: 
			const reply = (replyMessage) => {
                const result = socket.send(JSON.stringify({ ...replyMessage, id: socket.id}));
                // 1=success, 2=dropped due to backpressure; 0= built up backpressure will drain
                return result!==2; }
			// subscription called also called when unsubscribing (which auto-happens with socket close too)
			// we only want to call on actual subscription
			if( channelCnt>oldCnt )
				socketSubscription( socket.id, Buffer.from(topic).toString(), reply, channelCnt ) 
		},
		
		message: (socket, message, isBinary) =>{
			const publish = (channel,data) =>socket.publish(channel, JSON.stringify({ ...data, id: socket.id }));
			const reply = (replyMessage) => {
                const result = socket.send(JSON.stringify({ ...replyMessage, id: socket.id}));
                // 1=success, 2=dropped due to backpressure; 0= built up backpressure will drain
                return result!==2; }
			const subscribe = (channel) => socket.subscribe(channel);
			const unsubscribe = (channel) => socket.unsubscribe(channel);
			const data = JSON.parse(Buffer.from(message)||{});
			// socket {} object same as getUserData() : { url: '', auth: '', id: 0 }
			socketMessage( socket.id, data, publish, reply, subscribe, unsubscribe, socket.getUserData() );
		} 
	})
	.listen(bind.port, (listenSocket) => {
		if (listenSocket) {
			console.log( `=====================`);
			console.log( `µWebSockets.js Server: running on ${bind.hostname}:${bind.port}:`);
			console.log( `=====================`);
		}
	});

	return {
        // TODO: future functionality accessible when module run
        socketInfo: function( id ){
            //const socket = .. / getRemoteAddressAsText().toString()
            console.log( `[socketInfo] Returns info about a unique socket#${id}:` )
        },
        publish: function( channel, data ){
            console.log( `[publish] Publishing to ${channel}: ${data}`)
        },
        quit: function(){
            console.log( `[quit] Quitting` )
        }
    }
}
