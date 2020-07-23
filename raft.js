
const TIMEOUT_MAX = 500;
const TIMEOUT_MIN = 50;
const TIMEOUT_CANDIDATE = 500;
const HEART_INTERVAL = 20;

const CMD_HEART_BEAT = 0;
const CMD_HEART_BEAT_RSP = 1;
const CMD_ELECT_REQUEST = 2;
const CMD_ELECT_RSP = 3;

/**
 * Raft
 * @param transport
 * @param logStore
 * @param nodeConfig
 * @constructor
 */
let Raft = function (transport,logStore,nodeConfig) {

    this.changeToLeader = ()=>this.changeTo(new Leader(this));
    this.changeToFollower = ()=>this.changeTo(new Follower(this));
    this.changeToCandidate = ()=>this.changeTo(new Candidate(this));
    this.changeTo = function(role){
        this.role.stop();
        this.role = role;
        this.role.start();
    };
    this.dump = ()=>{
        return this.role.dump();
    };

    this.transport = transport;
    this.logStore = logStore;
    this.term = logStore.lastLog().term ;
    this.role = new Follower(this);
    this.nodeConfig = nodeConfig;
    this.transport.onMessage = (from,message)=>this.role.messageReceived(from,message);

    this.role.start();
};

/**
 * Follower
 * @param raft
 * @constructor
 */
let Follower = function (raft) {
    this.raft = raft;

    this.dump = ()=> {return "I am follower!";};

    this.timeout = function () {
        this.raft.changeToCandidate();
    };
    this.startTimer = (base = TIMEOUT_MIN) => {
        const follower = this;
        this.timer = setTimeout(()=>follower.timeout(), Math.random() * (TIMEOUT_MAX - TIMEOUT_MIN) + base);
    };
    this.elect = (from, message) => {
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

    this.handleMessage = (from, message) => {
        if (message.cmd === CMD_ELECT_REQUEST) {
            this.elect(from, message);
        } else if (message.cmd === CMD_HEART_BEAT) {

        } else {
            console.log('warning wrong follower msg:' + message.cmd + ' ! ignored');
        }
    };

    this.start = () => this.startTimer();
    this.stop = () =>{ clearTimeout(this.timer);}
    this.messageReceived = (from, message) => {
        clearTimeout(this.timer);
        this.startTimer();
        this.handleMessage(from, message);
    };
};

/**
 * Leader
 * @param raft
 * @constructor
 */
let Leader = function (raft) {
    this.raft = raft;


    this.dump = ()=> {return "I am leader!";};

    this.sendHeart = (node) => {
        if(node.address !== this.raft.transport.address) {
            this.raft.transport.sendMessage(node.address, {
                cmd: CMD_HEART_BEAT,
                data: {}
            });
        }
    };
    this.handleMessage = function (from, message) {
        if (message.cmd === CMD_HEART_BEAT_RSP) {

        } else if (message.cmd === CMD_HEART_BEAT) {
            this.raft.changeToFollower();
        } else if (message.cmd === CMD_ELECT_REQUEST) {

        } else {
            console.log('Warning error leader message! Ignored!');
        }
    };

    this.start = () => {
        this.timer = setInterval(() => this.raft.nodeConfig.nodes.forEach(this.sendHeart), HEART_INTERVAL);
        console.log("I am become leader address " + this.raft.transport.address);
    }
    this.stop = () =>{ clearInterval(this.timer); console.log('exit leader!!');};
    this.messageReceived = function (from, message) {
        this.handleMessage(from, message);
    };
};
/**
 * Candidate
 * @param raft
 * @constructor
 */
let Candidate = function (raft) {
    this.raft = raft;
    this.voteNumber = 1;
    this.term = raft.term;


    this.dump = ()=> {return "I am candidate!";};

    this.handleMessage = (from, message) => {
        if (message.cmd === CMD_ELECT_RSP) {
            if (message.data.support === 1 && this.term === message.data.term) {
                this.voteNumber += 1;
            }
        } else if (message.cmd === CMD_HEART_BEAT) {
            this.raft.changeToFollower();
        } else {
            console.log('Warning error candidate message : ' + message.cmd + ' ! Ignored!');
        }
    };
    this.electTimeout = () => {
        // more than half of nodes support me
        if (this.voteNumber * 2 > this.raft.nodeConfig.nodeNumbers) {
            this.raft.term = this.term;
            this.raft.changeToLeader(this.term);
        } else {
            this.start();
        }
    };
    this.sendVoteRequest = (node) => {
        if(node.address === this.raft.transport.address) return;
        let lastLog = this.raft.logStore.lastLog();
        this.raft.transport.sendMessage(node.address, {
            cmd: CMD_ELECT_REQUEST,
            data: {
                term: this.term, msgTerm: lastLog.term, msgIndex: lastLog.logIndex
            }
        });
    };

    this.start = () => {

        //increase term
        this.term += 1;
        //start elect timeout timer
        const candidate = this;
        this.timer = setTimeout(()=>candidate.electTimeout(), TIMEOUT_CANDIDATE);

        //send vote request to all nodes
        this.raft.nodeConfig.nodes.forEach(this.sendVoteRequest);
    };
    this.stop = () => clearTimeout(this.timer);
    this.messageReceived = function (from, message) {
        this.handleMessage(from, message);
    };
};

exports.Raft = Raft;