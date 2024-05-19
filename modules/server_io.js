/* Simplified stock exchange made with Socket.IO pub/sub */
import express from "express";
import { createServer } from "http";
// import { createServer } from "https";
import { Server } from "socket.io";

const port = 3000;
const hostname = 'localhost';
const DEBUG = true; // turn it off for benchmarking as this slows system down!
const channelUpdate = true; // when on, this updates ALL members in channel of price change, slows system down

/* We measure transactions per second server side */
let transactions = 0;

/* Share valuations */
let shares = {
	'NFLX': 280.48, 'TSLA': 244.74, 'AMZN': 1720.26, 'GOOG': 1208.67, 'NVDA': 183.03
};
let volumes = { 
	'NFLX': 0, 'TSLA': 0, 'AMZN': 0, 'GOOG': 0, 'NVDA': 0 
};


/* Print transactions per second */
function getCurrentTime() {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	return `${hours}:${minutes}:${seconds}`;
}
  
let last = Date.now();
let clientsCount = 0;
setInterval(() => {
	if( transactions>0 ){
		const transactionsPerSecond = (transactions/((Date.now() - last)/1000)).toFixed(2)
		console.log(`${getCurrentTime()}: Transactions(${transactions}) = ${transactionsPerSecond}/s (clients:${io.engine.clientsCount},${clientsCount}):`);
		console.log('   '+Object.keys(shares).map( share=>{
			return (`${share}: `+shares[share].toFixed(2)).padEnd(20);
		}).join('') );
		console.log('   Vol:  '+Object.keys(volumes).map( share=>{ return (volumes[share]+'').padEnd(20) }).join(''));
		console.log("   -");
		transactions = 0;
		last = Date.now();
	}
}, 5000);


// certs
const certs = {
    cert: '', // fs.readFileSync("/etc/letsencrypt/-blah-/fullchain.pem"),
    key: '', // fs.readFileSync("/etc/letsencrypt/-blah-/privkey.pem")
}

const app = express();
const httpsServer = createServer(certs.cert&&certs.key ? certs : {},app);
const io = new Server(httpsServer, { /* options */ });

/* Define the server */
io.on("connection", (socket) => {
	if(DEBUG) console.log(`Client connected: id=${socket.id}, transport='${socket.conn.transport.name}'`);
	clientsCount++;

	socket.on("disconnect", (reason) => {
		clientsCount--;
		if(DEBUG) console.log(`Client id=${socket.id} disconnected: (transport:${socket.conn.transport.name}) ${reason}`);
	});
	
	socket.on('subscribe', (channel) => {
		if(DEBUG) console.log(`Client ${socket.id} subscribed to channel '${channel}'`);
		socket.join(channel);
	});
	
	socket.on('message', ({ share, action, channel }) => {
		// const channel = `shares/${json.share}/value`;
		if(DEBUG) console.log( `[Message Received @ '${channel}' -> ${action} ${share}`)

		//if( action==='sub' ) -> do a direct emit 'subscribe', see above.
		if( action==='buy')
			shares[share] *= 1.001;			/* For simplicity, shares increase 0.1% with every buy */
		else if( action==='sell')
			shares[share] *= 0.999; 	/* For simplicity, shares decrease 0.1% with every sale */
		volumes[share]++;
		transactions++;

		// The broadcast slows things down a LOT, since we have so many people in so few rooms.
		if( channelUpdate )
			io.to(channel).emit('message', { channel, action: 'info', share, value: shares[share].toFixed(2), volume: volumes[share] });
		else
			socket.emit({ channel, action: 'info', share, value: shares[share].toFixed(2), volume: volumes[share] })
	});
});

console.log( `Socket.IO Server Running on ${hostname}:${port}:`);
httpsServer.listen(port); //hostname