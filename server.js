/* Websocket Stress Tester (Server Side)
 * Run with: npm install && node server.js
 *
 * Run client afterwards: node client.js
 * 
 * Based on benchmark idea by Alex Hultman; built by Filipe Laborde / fil@rezox.com
 * MIT License - do as you wish, take responsibility and ownership.
 */

import inquirer from 'inquirer';
import os from "os";

// CHOOSE SERVER ENGINE TO TEST - done at bottom in user prompt for testing
// import { serverEngine } from "./modules/server.uwebsocket.js"
// import { serverEngine } from "./modules/server.ws.js"
// import { serverEngine } from "./modules/server.socket-io.uwebsocket.js"
// import { serverEngine } from "./modules/server.socket-io.js"

let DEBUG = false; // turn it off for benchmarking as this slows system down!
let serverModule = '';
const channelUpdate = true; // when on, this updates ALL members in channel of price change, slows system down


const bind = {
	hostname: 'localhost',
	port: 3000,
	namespace: 'testroom',
	cert: '',
	key: '',
}

/* We measure transactions per second server side */
let transactions = 0;

/* Share valuations */
const channels = {
	'NFLX': { value: 280.48, volume: 0, subs: [], },
	'TSLA': { value: 244.74, volume: 0, subs: [], },
	'AMZN': { value: 1720.26, volume: 0, subs: [], },
	'GOOG': { value: 1208.67, volume: 0, subs: [], },
	'NVDA': { value: 183.03, volume: 0, subs: [], },
}



// DISPLAY STATISTICS ---------------------------------------------------------------------------
/* Print transactions per second */
let clientsCount = 0;
let socketStats = { opens: 0, closes: 0, errors: 0, dataDrops: 0, msgCnt: 0 }
let last = Date.now();
let cpuStats = { cpuTicks: 0, idleTicks: 0, processUsage: 0, now: 0 }
function showStats(){
	function getCurrentTime() {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		return `${hours}:${minutes}:${seconds}`;
	}
	function getCPU(){
		const now = Date.now()
		const processCpuUsage = process.cpuUsage()
		const processUsage = Object.values(process.cpuUsage(cpuStats.processCpuUsage)).reduce((acc, val) => acc + val, 0)
		
		const cpuUsage = os.cpus();
		const idleTicks = cpuUsage.reduce((acc, cpu) => acc + cpu.times.idle, 0);
		const cpuTicks = cpuUsage.reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((acc, val) => acc + val, 0), 0);

		const processCPU = Math.round(processUsage / (now-cpuStats.now)/10);
		const idleCPU = Math.round((idleTicks-cpuStats.idleTicks) / (cpuTicks-cpuStats.cpuTicks) * 100);
		let memory = '';
		for ( const [key,value] of Object.entries(process.memoryUsage()) ){ 
			const mem = Math.round(value/1024/1024);
			if( mem>1 )
				memory += ` ${key}(${mem}MB)`;
		}
		cpuStats = { cpuTicks, idleTicks, processCpuUsage, now }
		return `${os.cpus()[0].model}:${memory}, processCPU(${processCPU}%), idleCPU(${idleCPU}%)`
	}

	const secondsPassed = ((Date.now() - last)/1000);
	const transactionsPerSecond = Math.round(transactions/secondsPassed);
	const messagesPerSecond = Math.round(socketStats.msgCnt/secondsPassed);
	console.log(`\n--------`);
	console.log(`${getCurrentTime()}: [${getCPU()}]`);
	console.log("--------");
	if( socketStats.dataDrops>0 || transactions>0 ){
		const channelKeys = Object.keys(channels);
		console.log(`         (clients:${clientsCount} [+${socketStats.opens},-${socketStats.closes}]) [${serverModule}] (${messagesPerSecond} msg/s) transactions(${transactions}: ${transactionsPerSecond}/s)`
			+`${socketStats.dataDrops ? ` (DROPPED:${socketStats.dataDrops})` : ''} ${socketStats.errors ? ` (ERRORS: ${socketStats.errors})` : ''}:`);
		console.log('          '+channelKeys.map( channel=>{
			return (`${channel}: `+channels[channel].value.toFixed(2)).padEnd(20);
		}).join('') );
		console.log('          Subs: '+channelKeys.map( channel=>{ return (channels[channel].subs.length+'').padEnd(20) }).join(''));
		console.log('           Vol: '+channelKeys.map( channel=>{ return (channels[channel].volume+'').padEnd(20) }).join(''));
		// reset stats for new refresh
		transactions = 0;
		socketStats = { opens: 0, closes: 0, errors: 0, dataDrops: 0, msgCnt: 0 }
		last = Date.now();
	}
	setTimeout( ()=>showStats(), 5000);
};

// OUR FUNCTIONS ---------------------------------------------------------------------------
function padId(id){
	return (id+'').padStart(3)
}
function socketOpen( id, reply ){
	if(DEBUG) console.log(`++ [${padId(id)}] Client socket authed & connected` );
	reply({ action: 'auth_confirmed' }); // socket authenticated, send back socket-id + whatever settings to user
	clientsCount++; socketStats.opens++;
}

function socketClose( id, code, message ){
	clientsCount--; socketStats.closes++;
	// remove subscriptions with this socket - loop through subscriptionsto attempt removing it.
	Object.keys(channels).forEach( channel=>
		channels[channel].subs = channels[channel].subs.filter( s=>s.id!==id) );
	if(DEBUG) console.log(`-- [${padId(id)}] Client disconnected: ${code}: ${message}`);
}

function socketDropped( id ){
	// if excess backpressure, can be dropped.
	socketStats.dataDrops++; 
	if(DEBUG) console.log(`!! [${padId(id)}] client dropped, excess backpressure.`)
}

function socketError( id ){
	socketStats.errors++;
	if(DEBUG) console.log(`!! [${padId(id)}] client ERROR, closing.`)
}

function socketMessage( id, data, publish, reply, subscribe, unsubscribe, sockInfo ){
	socketStats.msgCnt++; // the message received
	/* Parse JSON and perform the action */
	// console.log( `socket Info:`, sockInfo ) // url, auth, id
	const { channel, id: senderId, action, share }= data;
	if( !channel || !action ){
		socketStats.errors++;
		if(DEBUG) console.log( `<< [${padId(id)}] Incoming message (not JSON):`, data, data() );
		return;
	}
	if( action==='subscribe' ){
		if(DEBUG) console.log( `~~ [${padId(id)}] Subscription initiated to '${channel}';`)
			// subscription has come in, do it.
		subscribe(channel);
		socketStats.msgCnt++; // the message it will send				
		return;
	}

	if( action==='buy')
		channels[channel].value *= 1.001;			/* For simplicity, shares increase 0.1% with every buy */
	else if( action==='sell')
		channels[channel].value *= 0.999; 	/* For simplicity, shares decrease 0.1% with every sale */
	channels[channel].volume++;
	transactions++;
	if( action==='buy' || action==='sell' )
		if(DEBUG) console.log( `<< [${padId(id)}] Client message from #${id} -> ${action} ${share}`)

	// The broadcast slows things down a LOT, since we have so many people in so few rooms.
	const channelData =  { channel, action: 'info', share, value: channels[channel].value.toFixed(2), volume: channels[channel].volume };
	const channelCnt = channels[channel].subs.length;
	if( channelCnt>0 ){
		const result = publish(channel, channelData);
		socketStats.msgCnt += channelCnt;
		if(DEBUG) console.log( `>* [${padId(id)}] Broadcast on '${channel}' Info, (cnt:${channelCnt}) ${result ? '' : `[FAIL]`}`)

		// NOTE: IO broadcasts to ALL, including sender, while uWs excludes sender [so send to that separately]
		if( !serverModule.includes('socket-io') ){			
			const result = reply(channelData);
		}
	} else {
		// channels disabled, so simply reply to the user
		const result = reply(channelData);
		if(DEBUG) console.log( `>> [${padId(id)}] Replying on '${channel}' Info. ${result ? '' : `[FAIL]`}`)
		socketStats.msgCnt++; // send back to user
	}
}

function socketSubscription( id, channel, replySubscribed, channelCnt=0){
	if( !channel || !id ){
		if(DEBUG) console.log( `!! [${padId(id)}] Invalid subscription channel. Ignoring.` );
		return;
	}
	if( channels[channel].subs.indexOf(id)<0 ){
		channels[channel].subs.push( id );
		const result = replySubscribed({ channel, action: 'subscribe_ok', channelCnt });
		if(DEBUG) console.log( `~~ [${padId(id)}] Confirmation of subscription ${channelCnt ? `(len=${channels[channel].subs.length},channelCnt=${channelCnt})` : ''}` );
	} else {
		if(DEBUG) console.log( `~~ [${padId(id)}] Rejection of subscription, already subscribed (${channel})` );
	}	
}

function socketAuthenticate( namespace, auth ){
	// for testing we accept hard-coded token set on client
	// console.log( `[socketAuthenticate] namespace(${namespace}) auth(${auth})`)
	return auth==='4R3ALT0K3N5_uFQ'
}
		
(async ()=>{
	// call the server engine
	console.log( `\n\n` );
	const _debug = await inquirer.prompt([{
		type: 'list',
		name: 'choice',
		message: 'Show explicit debug output?',
		choices: [
			{ name: 'NO', value: false },
			{ name: 'yes', value: true },
		]}]);	  
	DEBUG = _debug.choice;

	const module = await inquirer.prompt([{
		  type: 'list',
		  name: 'choice',
		  message: 'Which server engine to run?',
		  choices: [
			{ name: 'uWebsocket.js', value: './modules/server.uwebsocket.js' },
			{ name: 'Express/Websockets', value: './modules/server.express.ws.js' },
			{ name: 'Socket-IO', value: './modules/server.socket-io.js' },
			{ name: 'Socket-IO+uWebsocket.js', value: './modules/server.socket-io.uwebsocket.js' },
		  ]}]);
	serverModule = module.choice.split('server.')[1].replace('.js','');
	console.log( `Thank you, importing\nimport { serverEngine } from "${module.choice}";\n` );
	const { serverEngine } = await import( module.choice );

	if( DEBUG ) console.log( `** TESTING MODE ON (Slows system down!) **\n`)

	showStats();
	serverEngine({ bind, socketAuthenticate, socketOpen, socketClose, socketError, socketDropped, socketMessage, socketSubscription });
})()