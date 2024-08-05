import WebSocket from 'ws';

let retryCnt = 0;
const isBrowser = !( typeof process !== 'undefined' && process && process.versions && process.versions.node )

export function clientSocket( bind, socketOpen, socketMessage, socketError, socketClose ){
	// return new Promise( (resolve)=>{
		let socket = null, socketId = null;
		function socketInit(){
			let protocol = 'ws:';
			let host = bind.hostname + ( bind.port ? ':' + bind.port : '' )
			if ( isBrowser ){
				protocol = location.protocol.replace(/^http/, 'ws')
				host =( bind.hostname ? bind.hostname + ( bind.port ? ':' + bind.port : '' ) : location.origin.split('://')[1] )
			}
			socket = new WebSocket(`${protocol}//${host}/${bind.namespace}`, bind.token.split(',') );

			socket.on('message', (data) => {
				const send = (message) => socket.send(JSON.stringify(message));
				// const subscribe = null; // no native client-side subscribe function
				socketMessage( socketId, JSON.parse(Buffer.from(data)) || {}, send ) 
			});

			socket.on('error', (error) => socketError( socketId, error.message ));
				
			socket.on('close', (message) =>{
				socketClose( socketId );
				retryCnt++;
				// attempt reconnect after a few seconds
				setTimeout( ()=>{ socket = null; socketId = null; socketInit(); }, parseInt(Math.random()*3000)+retryCnt*2000)
			});

			socket.on('open', () => {
				// uWs: socket.send: 1=success, 2=dropped due to backpressure; 0= built up backpressure will drain
				retryCnt = 0;
				const send = (message) => socket.send(JSON.stringify(message));
				socketOpen( socketId, send );
				// resolve();
				});
		}
		socketInit();

		return {
			setId: (id) => { socketId = id },
			getId: () => socketId,
			close: () => socket?.close() || false
		}
	// })
}