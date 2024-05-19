import express from "express";
import { createServer, request } from "http";
// import { createServer } from "https";
import { WebSocketServer } from 'ws';

export function serverEngine({ bind, socketAuthenticate, socketOpen, socketClose, socketError, socketDropped, socketMessage, socketSubscription }){
    // give each socket a unique #
    let socketCnt = 0;
    let clientsCount = 0;

    if( typeof(socketDropped)==='function' ) console.log(`NOTE: socketDropped not defined in module.`)

    // certs
    const certs = {
        cert: bind.cert, // fs.readFileSync("/etc/letsencrypt/-blah-/fullchain.pem"),
        key: bind.key, // fs.readFileSync("/etc/letsencrypt/-blah-/privkey.pem")
    }

    const app = express();
    const httpsServer = createServer(certs.cert&&certs.key ? certs : {}, app);
    const socketServer = new WebSocketServer({ server: httpsServer });

    // Intercept socket upgrade, check authentication
    httpsServer.on('upgrade', (req, socket, head) => {
        req.auth = req.headers['sec-websocket-protocol'].replace('token,','');
        if( !socketAuthenticate( req.url, req.auth )){
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }        
        // automatically continues with upgrade...
    });

    socketServer.on("connection", (socket, req) => {
        // now attach info to the socket (passed via 'req' - MUST store req. data required in socket)
        socket.id = '_'+ ++socketCnt;
        socket.info = { auth: req.auth, url: req.url, id: socket.id, channel:[] }
        // some infrastructure to track connections, keep alive
        socket.isAlive = true;
        
        // track number of active connections
        clientsCount++;
        
        socket.on('error', () => socketError(socket.id) );
        socket.on('pong', () => { socket.isAlive = true });

        socket.on('close', (code, message) => { clientsCount--; socketClose(socket.id, code, message) });
        
        socket.on('message', (data) => {
            const publish = (channel,data) => {
                socketServer.clients.forEach( (_socket)=>{
                    if( _socket!==socket && _socket.info.channel.includes(channel) )
                        _socket.send(JSON.stringify({ ...data, id: socket.id}))
                return true;
                })}
			const reply = (replyMessage) =>{ socket.send(JSON.stringify({ ...replyMessage, id: socket.id})); return true; }
			const subscribe = (channel) =>{
                if( socket.info.channel.includes(channel) ) return false;
                socket.info.channel.push( channel );
                let channelCnt = 0;
                socketServer.clients.forEach( (_socket)=>{ if( _socket.info.channel.includes(channel) ) channelCnt++; });
                socketSubscription( socket.id, channel, reply, channelCnt );
                return true;
            }
            const unsubscribe = (channel) =>{
                const idx = socket.info.channel.indexOf(socket.id)
                if( idx>-1 )
                    socket.info.channel.splice(idx,1)
            }
            socketMessage( socket.id, JSON.parse(data||{}), publish, reply, subscribe, unsubscribe, socket.info );
        });

        // now call user open code
        const reply = (replyMessage) =>{ socket.send(JSON.stringify({ ...replyMessage, id: socket.id})); return true; }
        socketOpen( socket.id, reply );
    });

    // infrastructure PING 
    // ideas from: https://www.npmjs.com/package/ws#server-broadcast
    setInterval( ()=>{
        if( clientsCount>0 ){
            socketServer.clients.forEach( (socket)=>{
                if( socket.isAlive===false ) return socket.terminate();
                socket.isAlive = false;
                // call ping, and socket (by default) will return a pong that toggles isAlive attribute
                socket.ping();
            })
        }
    }, 30000);

    console.log( `========================`);
    console.log( `Express/Websocket Server: running on ${bind.hostname}:${bind.port}.`);
    console.log( `========================`);
    httpsServer.listen(bind.port); //hostname

    return {
        // TODO: future functionality accessible when module run
        app,
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