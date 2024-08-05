import io from 'socket.io-client';

const isBrowser = !( typeof process !== 'undefined' && process && process.versions && process.versions.node )

export function clientSocket( bind, socketOpen, socketMessage, socketError, socketClose ){
	// return new Promise( (resolve)=>{
	// if namespace, server must be io.of('/same-namespace').connect(....)
	let protocol = 'http:';
	let host = bind.hostname + ( bind.port ? ':' + bind.port : '' )
	if ( isBrowser ){
		protocol = location.protocol
		host =( bind.hostname ? bind.hostname + ( bind.port ? ':' + bind.port : '' ) : location.origin.split('://')[1] )
	}
	const socket = io(`${protocol}//${host}/${bind.namespace}`, { query: bind.token.replace('token,','token=') } );
	// const socket = io(`http://${bind.hostname}:${bind.port}/${bind.url}`, { query: 'TOKEN' }); //${bind.namespace}
	// let socket = new WebSocket(`ws://${bind.hostname}:${bind.port}/${bind.url}`, bind.token.split(',') );

	socket.on('message', (data) =>{
		const send = (data) => socket.emit('message', data);
		const subscribe = (channel) => socket.emit('subscribe', channel); /* only IO has this, others send msg, server [uWs] can manage subscription */
		return socketMessage( socket.id, data, send, subscribe ); });

	// socket.on('subscribe_ok', (data) => {}) // for ease, we just use action and emit 'message', could IO-style could use another emit listener

	socket.on('error', (error) => socketError( socket.id, error.message ));
	
	socket.on('disconnect', (reason) => socketClose( socket.id, reason ));
	
	socket.on('connect', () => {
		const send = (data) => socket.emit('message', data);
		const subscribe = (channel) => socket.emit('subscribe', channel); /* only IO has this, others send msg, server [uWs] can manage subscription */
		socketOpen( socket.id, send, subscribe );
		// resolve();	
		});
	
	return {
		setId: (id) => {}, // doesn't do anything as socketId is set already
		getId: () => socketId,
		close: () => socket?.close() || false
	}
	// });
}