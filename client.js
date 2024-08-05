/* Websocket Stress Tester (Client Side)
 * Run with: npm install && node client_ws.js
 *
 * Run server first: node server_uws.js - or - node server_ws.js
 * 
 * Based on benchmark by Alex Hultman; tweaked by Filipe Laborde / fil@rezox.com
 */
import inquirer from 'inquirer';

// choose client library to use (if server is io, this must be client.io.js)
// import { clientSocket } from "./modules/client.ws.js";
// import { clientSocket } from "./modules/client.io.js";

let clientSocket;
const isBrowser = !( typeof process !== 'undefined' && process && process.versions && process.versions.node )

// choose stress test level
let stressLevel = 'medium'
const stressSet = {
	single: {
		name: "1 client, 1 trade/s, 1 messages/s",
		numClients: 1, 		// active socket connections
		activeTraders: 1,	// sockets sending buy/sell activity
		tradeFreq: 1,		// frequency of buy/sell activity per second
		pubsub: false,		// subscribe channel & broadcast updates to channel (testing pub/sub)
	},
	clients_5: {
		name: "5 clients, 2 trades/s, up to 10 messages/s",
		numClients: 5, 		
		activeTraders: 2,	
		tradeFreq: 1,		
		pubsub: true,		
	},
	clients_50: { 
		name: "50 clients, 5 trades/s, up to 250 messages/s",
		numClients: 50,
		activeTraders: 5,
		tradeFreq: 1,
		pubsub: true,
	},
	clients_200: { 
		name: "200 clients, 100 trades/s, up to 20,000 messages/s",
		numClients: 200,
		activeTraders: 50,
		tradeFreq: 2,
		pubsub: true,
	},	
	clients_500: {
		name: "500 clients, 1,000 trades/s, up to 500,000 messages/s",
		numClients: 500,
		activeTraders: 50,
		tradeFreq: 20,
		pubsub: true,
	},
	clients_1000: {
		name: "1000 clients, 4,000 trades/s, up to 4,000,000 messages/s",
		numClients: 1000,
		activeTraders: 200,
		tradeFreq: 20,
		pubsub: true,
	},
	clients_2000: {
		name: "2000 clients, 8,000 trades/s, up to 16,000,000 messages/s",
		numClients: 2000,
		activeTraders: 400,
		tradeFreq: 20,
		pubsub: true,
	},
	clients_3000: {
		name: "3000 clients, 12,000 trades/s, p to 36,000,000 messages/s",
		numClients: 3000,
		activeTraders: 600,
		tradeFreq: 20,
		pubsub: true,
	},
	clients_none: {
		name: "***** [ No Subscriptions Below, Direct Message Only ] *****",
		numClients: 0, activeTraders: 0, tradeFreq: 0, pubsub: false
	},
	clients_50_direct: { 
		name: "Easy, 50 clients, 10 trades/s (direct)",
		numClients: 50,
		activeTraders: 10,
		tradeFreq: 1,
		pubsub: false,
	},	

	clients_2000_direct: {
		name: "Medium: 2000 clients, 5,000 trades/s (direct)",
		numClients: 2000,
		activeTraders: 100,
		tradeFreq: 50,
		pubsub: false,
	},	
	clients_3000_direct: {
		name: "Hard: 3000 clients, 10,000 trades/s (direct)",
		numClients: 3000,
		activeTraders: 200,
		tradeFreq: 50,
		pubsub: false,
	},	
	clients_6000_direct: {
		name: "Hard: 6000 clients, 50,000 trades/s (direct)",
		numClients: 6000,
		activeTraders: 1000,
		tradeFreq: 50,
		pubsub: false,
	},
}

// SETTINGS + FAKE DATA ------------------------------------------------------------------------
const bind = {
	hostname: 'localhost',
	port: 3000,
	namespace: 'testroom',
	token: 'token,4R3ALT0K3N5_uFQ' // passed via sub-protocol header
}

let DEBUG = false; // must be off for higher stress levels, else slows system down significantly


let channelStats = {
	NFLX: { msgs: 0, bcasts: 0, subs: [] },
	TSLA: { msgs: 0, bcasts: 0, subs: [] },
	AMZN: { msgs: 0, bcasts: 0, subs: [] },
	GOOG: { msgs: 0, bcasts: 0, subs: [] },
	NVDA: { msgs: 0, bcasts: 0, subs: [] },
}
const channelSubs = {}; // which channel user sub'd to.
const shares = Object.keys(channelStats);
let socketStats = { opens: 0, closes: 0, errors: 0, dataDrops: 0, msgCnt: 0 }
let clientsCount = 0;

// DISPLAY STATISTICS ---------------------------------------------------------------------------
let last = Date.now();
function showStats(){
	function getCurrentTime() {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}
	const secondsPassed = ((Date.now() - last)/1000);
	const messagesPerSecond = Math.round(socketStats.msgCnt/secondsPassed);
	
	const subscriptions = Object.keys(channelStats).reduce((acc, key) => {
		return acc + channelStats[key].subs.length; },0);
	if( subscriptions>0 ){
		console.log(`${getCurrentTime()}: clients:${clientsCount} [+${socketStats.opens},-${socketStats.closes}] (${messagesPerSecond} msg/s) (level: ${stressLevel})`);
		Object.keys(channelStats).forEach( channel=>{
			console.log(channel+':  '+Object.keys(channelStats[channel]).map( stat=>{ return (stat+': '+(stat==='subs' ? channelStats[channel][stat].length : channelStats[channel][stat])+'').padEnd(17) }).join(''));
		})
		console.log( "-" );
	}
	socketStats = { opens: 0, closes: 0, errors: 0, dataDrops: 0, msgCnt: 0 }
	last = Date.now();
	setTimeout(() => showStats(), 5000);
}

// STRESS TESTER ----------------------------------------------------------------------------------
// loop ot establish connections, only does next connection after previous successfully connected.
async function establishClients(remainingClients) {
	if (!remainingClients) {
		return;
	}

	const isActiveTrader = remainingClients < stressSet[stressLevel].activeTraders;
	const connectDelay = Math.floor(Math.random()*10000);
	setTimeout( ()=>clientConnection({isActiveTrader, tradeFreq: stressSet[stressLevel].tradeFreq}), connectDelay );

	establishClients(remainingClients - 1);
}

function clientConnection({isActiveTrader, tradeFreq, retryTime=0, retryCnt=0}) {
	let reconnectTimeout, tradingInterval, channel;

	function padId(id){
		return (id+'').padStart(3)
	}
	function channelSubscribe(id, channel ){
		// if we aren't using pubsub on server-side, mimick it only on client side
		channelSubs['_'+id] = channel;
		channelStats[channel].subs.push(id);
		if( stressSet[stressLevel].pubsub )
			if(DEBUG) console.log(`>> [${padId(id)}] Received subscription confirmation '${channel}' ${isActiveTrader ? `.. starting TRADING!`:''}` );
		else
			if(DEBUG) console.log(`.. [${padId(id)}] Locally tracking subscription for '${channel}'` );
		return channelStats[channel].subs.length;
	}
	function startTrading(id, channel, share, send){
		if (!isActiveTrader) return;

		// based on tradeFreqs, hammers away buy/sell orders to this channel
		if( !share ) share = channel;
		clearInterval(tradingInterval);
		tradingInterval = setInterval(() => {
			const action = (Math.random() < 0.5 ? 'buy' : 'sell')
			channelStats[channel].msgs++;
			socketStats.msgCnt++;
			send({ channel, action, share });
			if(DEBUG && tradeFreq<10) console.log( `<< [${padId(id)}] Sending ${action} request for ${share}` )
		}, 1000/tradeFreq);
	}

	// function socketMessage( id, data, publish, send, subscribe, unsubscribe, socketInfo ){
	function socketMessage( id, data, send, subscribe ){
		socketStats.msgCnt++;
		let { channel, id: senderId, action, share, value, volume, channelCnt } = data;
		if( !action ){
			if(DEBUG) console.log(`>> [${padId(id)}] Received INVALID data: `, data );
			return;
		}
		// if(DEBUG) console.log(`>> [${padId(id)}] Incoming action: ${action}.`, data );
		if( action=='auth_confirmed' ){
			retryCnt = 0;
			clientsCount++;
			if( !id ){
				setId( senderId ); // socket-io already has ID, otehrs get it assigned now from server
				id = senderId;
				if(DEBUG) console.log(`>> [${padId(id)}] Socket authenticated, set id(${senderId}).` );
			}
			// Select the share/channel user client will engage in - subscribe client
			channel = shares[parseInt(Math.random() * shares.length)];
			
			/* Subscribe to the share we are interested in */
			if( stressSet[stressLevel].pubsub ){
				if(typeof(subscribe)==='function'){
					subscribe(channel)
				} else {
					socketStats.msgCnt++;
					send({channel, share, action: 'subscribe'});
				}
				if(DEBUG) console.log( `<< [${padId(id)}] Sending subscription request for ${channel}` )
			} else {
				channelSubscribe(id, channel);
				// no subscription wait, direct	to trading
				startTrading(id, channel, share, send);
			}
			return;
		}
		if( action=='subscribe_ok' ){
			const subCnt = channelSubscribe(id, channel);
			// confirmed subscription - start trading (if they enabled)
			startTrading(id, channel, share, send);
			return;
		}

		if(DEBUG) console.log(`>> [${padId(id)}] Received ${id==senderId ? `message   from channel ${channel}    ` : `broadcast from channel ${channel}#${senderId}`}: ${action} -> ${share} = ${Number(value).toFixed(2)} [${volume}]` );
		// if the acknowledgement is my id, then our update went through so indicate a valid update happened
		channelStats[channel].msgs++;
		// if it wasn't this user, it's a broadcast reaching us, increase tracker
		if( senderId!=id ) 
			channelStats[channel].bcasts++;
	}

	function socketError( id, message='' ){
		socketStats.errors++;
		if(DEBUG) console.log(`!! [${padId(id)}] DISCONNECTED: ${message}!`);
		// process.exit();
	}

	function socketClose( id, message='' ){
		socketStats.closes++;
		if( clientsCount>0 )
			clientsCount--;
		else
			console.log( `!! ClientCount<0 when closing ${id}`) 
;		let channel = '';

		if( !id ){
			console.log( `!! Closing socket without-id.`)
		} else {
			// remove from channel
			channel = channelSubs['_'+id];
			if( channel ){
				channelStats[channel].subs.filter( s=>s !== id );
				delete channelSubs['_'+id];
			}
		}

		clearInterval(tradingInterval); // stop trading
	}

	// socket would be droped at the upgrade phase, so if it's open, we are authenticated
	function socketOpen( id, send, subscribe ){
		socketStats.opens++;
	}

	// run the client socket connector using our tester functions above
	const { setId, getId } = clientSocket( bind, socketOpen, socketMessage, socketError, socketClose );
}

(async ()=>{
	// call the server engine
	console.log( `\n\n` );
	const debug = await inquirer.prompt([{
		type: 'list',
		name: 'choice',
		message: `Welcome to Websocket Stress Tester!\nShow explicit debug output?`,
		choices: [
			{ name: 'NO', value: false },
			{ name: 'yes', value: true },
		]}]);
	DEBUG = debug.choice;

	const module = await inquirer.prompt([{
		  type: 'list',
		  name: 'choice',
		  message: `\nWhich client websocket module to run (if backend has socket-io, must use that one!)?`,
		  choices: [
			{ name: 'Raw websockets (ws)', value: './modules/client.ws.js' },
			{ name: 'Socket-IO', value: './modules/client.io.js' },
		  ]}]);
	const _import = await import( module.choice );
	clientSocket = _import.clientSocket;

	const choices = Object.keys(stressSet).map( key => {
		return { name: stressSet[key].name, value: key } });
	const stressTest = await inquirer.prompt([{
		type: 'list',
		name: 'choice',
		message: `\nWhich test suit shoudl we run?`,
		choices
		}]);
	stressLevel = stressTest.choice;
	if( DEBUG ) console.log( `** TESTING MODE ON (Slows system down!) **\n`)

	showStats();

	console.log( `Stress-mode (${stressLevel}): creating ${stressSet[stressLevel].numClients} clients, ${stressSet[stressLevel].numClients * stressSet[stressLevel].activeTraders} active traders doing ${stressSet[stressLevel].tradeFreq} trades/second.`)
	establishClients(stressSet[stressLevel].numClients);
})()