import express from "express";
import { createServer } from "http";
// import { createServer } from "https";
import { Server } from "socket.io";

export function serverEngine({ bind, socketAuthenticate, socketOpen, socketClose, socketError, socketDropped, socketMessage, socketSubscription }){
    // give each socket a unique #
    let socketId = 0;
    
    // certs
	const certs = {
		cert_file_name: bind.cert,
		key_file_name: bind.key,
	}
    if( typeof(socketDropped)==='function' ) console.log(`NOTE: socketDropped not defined in module.`)
       
	const app = express();
	const httpsServer = createServer(certs.cert&&certs.key ? certs : {},app);
	const io = new Server(httpsServer, { /* options */ });
		
	io.engine.on("connection_error", (err) => {
		// likely a lingering polling request, for a socket that has been closed, not to work, ignore.
		if( err.req._query.transport==='polling' ) return;
		// console.log(err.context);  // some additional error context
	});

	/* Define the server */
	io.of('/'+bind.namespace||'')
	.use( (socket, next)=>{
		const auth = socket.handshake?.query?.token || ''
		if ( !socketAuthenticate( '/'+bind.namespace, auth ) )
			next(new Error('Authentication error'));
		next()
		// add to socket? socket.decoded = decoded;
		})
	.on("connection", (socket) => {
		const reply = (replyMessage) => socket.emit('message',{ ...replyMessage, id: socket.id});
		socket.info = { auth: '', namespace: '', id: socket.id };
		socketOpen( socket.id, reply );

		socket.on("error", (err) => socketError(err?.message));

		socket.on("disconnect", (reason) => socketClose( socket.id, 0, reason ));
		  
		socket.on('subscribe', (channel) =>{
			socket.join(channel);
			const channelCnt = io.of(channel).sockets.size;
			// const reply = (replyMessage) => socket.emit('message',{ ...replyMessage, id: socket.id});
			const replySubscribed = (replyMessage) => socket.emit('message',{ ...replyMessage, id: socket.id});
			socketSubscription( socket.id, channel, replySubscribed, channelCnt);
			}); /* only io has a client-side event for subscribe */
		
		socket.on("unsubscribe", (channel) => {
			socket.leave(channel);
			});
			
		socket.on('message', (data) => {
			const publish = (channel,data) => io.of('/'+bind.namespace||'').to(channel).emit('message', { ...data, id: socket.id});
			const reply = (replyMessage) => socket.emit('message',{ ...replyMessage, id: socket.id});
			const subscribe = (channel) => socket.join(channel);
			const unsubscribe = (channel) => socket.leave(channel);
			return socketMessage( socket.id, data, publish, reply, subscribe, unsubscribe, socket.info );
		});
	})
	
	console.log( `================`)
	console.log( `Socket.IO Server: running on ${bind.hostname}:${bind.port}:`);
	console.log( `================`)
	httpsServer.listen(bind.port); //hostname

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