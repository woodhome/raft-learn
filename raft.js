
const TIMEOUT_MAX = 500;
const TIMEOUT_MIN = 50;
const TIMEOUT_CANDIDATE = 500;
const HEART_INTERVAL = 20;

const CMD_HEART_BEAT = 0;
const CMD_HEART_BEAT_RSP = 1;
const CMD_ELECT_REQUEST = 2;
const CMD_ELECT_RSP = 3;
const CMD_QUERY_LOG_INDEX = 4;
const CMD_QUERY_LOG_INDEX_RSP = 5;

/**
 * Raft
 * @param transport
 * @param logStore
 * @param nodeConfig
 * @constructor
 */
class Raft {
    constructor (transport,logStore,nodeConfig) {
        this.transport = transport;
        this.logStore = logStore;
        this.term = logStore.lastLog().term ;
        this.logIndex = 0;
        this.role = new Follower(this);
        this.nodeConfig = nodeConfig;
        this.transport.onMessage = (from,message)=>this.role.messageReceived(from,message);
        this.role.start();
    }

    changeToLeader (){
        this.changeTo(new Leader(this));
    }
    changeToFollower (){
        this.changeTo(new Follower(this));
    }
    changeToCandidate (){
        this.changeTo(new Candidate(this));
    }
    changeTo (role){
        this.role.stop();
        this.role = role;
        this.role.start();
    }
    request(data){
        return this.role.request(data);
    }
    dump (){
        return this.role.dump() + JSON.stringify(this.logStore);
    };
}

/**
 * Follower
 * @param raft
 * @constructor
 */
class Follower   {
    constructor (raft) {
        this.raft = raft;
        this.leader = null;
    }
    request(data){
        return {leader:this.leader,error:-1};
    }
    dump () {
        return "I am follower!";
    }
    timeout () {
        this.raft.changeToCandidate();
    }
    startTimer(base = TIMEOUT_MIN) {
        const follower = this;
        this.timer = setTimeout(()=>follower.timeout(), Math.random() * (TIMEOUT_MAX - TIMEOUT_MIN) + base);
    }
    elect(from, message) {
        let lastLog = this.raft.logStore.lastLog();
        if (message.data.term > this.raft.term && (message.data.msgTerm > lastLog.term ||
            (message.data.msgTerm === lastLog.term && message.data.msgIndex >= lastLog.logIndex))) {
            this.raft.transport.sendMessage(from, {
                cmd: CMD_ELECT_RSP,
                data: {support: 1, term: message.data.term}
            });

            // reset timer
            clearTimeout(this.timer);
            this.startTimer(TIMEOUT_CANDIDATE);
            console.log("address : " + this.raft.transport.address + " elect ");
        }
    };

    handleMessage (from, message) {
        if (message.cmd === CMD_ELECT_REQUEST) {
            this.elect(from, message);
        } else if (message.cmd === CMD_HEART_BEAT) {
            //append logs
            let logs = message.data.logs;
            this.leader = from;
            this.raft.logStore.addLog(logs);

            //commit log
            let committed = message.data.committed;
            this.raft.logStore.commitLog(committed.term,committed.logIndex);

            //response
            let log = logs.length > 0 ? logs[logs.length - 1] : null;
            let data = log ? {term:log.term,logIndex:log.logIndex}:null;
            this.raft.transport.sendMessage(from,{
                cmd: CMD_HEART_BEAT_RSP,
                data:data
            });

        } else if(message.cmd === CMD_QUERY_LOG_INDEX){
            this.raft.transport.sendMessage(from,{
                cmd: CMD_QUERY_LOG_INDEX_RSP,
                data:this.raft.logStore.lastCommitted()
            });
        }else {
            console.log('warning wrong follower msg:' + message.cmd + ' ! ignored');
        }
    };

    start () {
        this.startTimer();
    }
    stop() {
        clearTimeout(this.timer);
    }
    messageReceived (from, message) {
        clearTimeout(this.timer);
        this.startTimer();
        this.handleMessage(from, message);
    };
}

/**
 * Leader
 * @param raft
 * @constructor
 */
class Leader  {
    constructor(raft) {
        this.raft = raft;
        this.raft.logIndex = 0;
        this.followers = [];
        this.raft.nodeConfig.nodes.filter((node) => node.address !== raft.transport.address)
            .map((node) => this.followers.push({address: node.address, term: -1, logIndex: -1}));
    }
    request(data){
        this.raft.logStore.addLog([{data:data,term:this.raft.term,logIndex: this.raft.logIndex++}]);
        return {error:0};
    }

    dump () {return "I am leader!";}

    updateFollower (address,term,logIndex){
        for(let i = 0 ; i < this.followers.length;i++){
            if(address === this.followers[i].address){
                this.followers[i].term = term;
                this.followers[i].logIndex = logIndex;
                break;
            }
        }

        this.followers.sort((a,b)=>{
            if(a.term < b.term || (a.term === b.term && a.logIndex < b.logIndex)){
                return -1;
            }else if(a.term === b.term && a.logIndex === b.logIndex){
                return 0;
            }
            return 1;
        });
        //commit the log that received rsp fom major followers.
        let major = this.followers[Math.ceil((this.followers.length + 1)/ 2)];
        this.raft.logStore.commitLog(major.term,major.logIndex);

    }

    sendHeart (follower) {
        let appendLogs = [];
        if(follower.term === -1){
            this.raft.transport.sendMessage(follower.address,{
                cmd: CMD_QUERY_LOG_INDEX,
                data:{}
            });
        }else{
            appendLogs = this.raft.logStore.getAppendLogs(follower.term,follower.logIndex);
        }
        let lastCommitted = this.raft.logStore.lastCommitted();
        this.raft.transport.sendMessage(follower.address, {
            cmd: CMD_HEART_BEAT,
            data: {logs:appendLogs,committed:lastCommitted}
        });

    }
    handleMessage (from, message) {
        if (message.cmd === CMD_HEART_BEAT_RSP) {
            if(message.data) {
                this.updateFollower(from, message.data.term, message.data.logIndex);
            }
        } else if (message.cmd === CMD_HEART_BEAT) {
            this.raft.changeToFollower();
        } else if (message.cmd === CMD_ELECT_REQUEST) {

        } else if(message.cmd === CMD_QUERY_LOG_INDEX_RSP){
            let lastCommittedLog = message.data;
            this.updateFollower(from,lastCommittedLog.term,lastCommittedLog.logIndex);
        }else {
            console.log('Warning error leader message ' + message.cmd + '! Ignored!');
        }
    };

    start (){
        this.timer = setInterval(() => this.followers.forEach((follower)=>this.sendHeart(follower)), HEART_INTERVAL);
        console.log("I am become leader address " + this.raft.transport.address);
    }
    stop (){
        clearInterval(this.timer); console.log('exit leader!!');
    }
    messageReceived (from, message) {
        this.handleMessage(from, message);
    }
};
/**
 * Candidate
 * @param raft
 * @constructor
 */
class Candidate{
    constructor(raft) {
        this.raft = raft;
        this.voteNumber = 1;
        this.term = raft.term;
    }

    request(data){
        return {error:-2};
    }

    dump () {
        return "I am candidate!";
    }

    handleMessage (from, message){
        if (message.cmd === CMD_ELECT_RSP) {
            if (message.data.support === 1 && this.term === message.data.term) {
                this.voteNumber += 1;
            }
        } else if (message.cmd === CMD_HEART_BEAT) {
            this.raft.changeToFollower();
        } else {
            console.log('Warning error candidate message : ' + message.cmd + ' ! Ignored!');
        }
    }
    electTimeout () {
        // more than half of nodes support me
        if (this.voteNumber * 2 > this.raft.nodeConfig.nodeNumbers) {
            this.raft.term = this.term;
            this.raft.changeToLeader(this.term);
        } else {
            this.start();
        }
    }
    sendVoteRequest (node) {
        if(node.address === this.raft.transport.address) return;
        let lastLog = this.raft.logStore.lastLog();
        this.raft.transport.sendMessage(node.address, {
            cmd: CMD_ELECT_REQUEST,
            data: {
                term: this.term, msgTerm: lastLog.term, msgIndex: lastLog.logIndex
            }
        });
    }

    start() {

        //increase term
        this.term += 1;
        //start elect timeout timer
        const candidate = this;
        this.timer = setTimeout(()=>candidate.electTimeout(), TIMEOUT_CANDIDATE);

        //send vote request to all nodes
        this.raft.nodeConfig.nodes.forEach((node)=>this.sendVoteRequest(node));
    }
    stop (){
        clearTimeout(this.timer);
    }
    messageReceived(from, message) {
        this.handleMessage(from, message);
    }
}

exports.Raft = Raft;