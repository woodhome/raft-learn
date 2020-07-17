
const TIMEOUT_MAX = 500;
const TIMEOUT_MIN = 50;
const TIMEOUT_CANDIDATE = 500;
const HEART_INTERVAL = 10;

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

    this.transport = transport;
    this.logStore = logStore;
    this.term = logStore.msgTerm ;
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

    this.timeout = function () {
        this.raft.changeToCandidate();
    };
    this.startTimer = (base = TIMEOUT_MIN) => {
        const follower = this;
        this.timer = setTimeout(()=>follower.timeout(), Math.random() * (TIMEOUT_MAX - TIMEOUT_MIN) + base);
    };
    this.elect = (from, message) => {
        if (message.data.term > this.raft.term && (message.data.msgTerm > this.raft.logStore.msgTerm ||
            (message.data.msgTerm === this.raft.logStore.msgTerm && message.data.msgIndex >= this.raft.logStore.msgIndex))) {
            this.raft.transport.sendMessage(from, {
                cmd: CMD_ELECT_RSP,
                data: {support: 1, term: message.data.term}
            });

            // reset timer
            clearTimeout(this.timer);
            this.startTimer(TIMEOUT_CANDIDATE);
        }
    };

    this.handleMessage = (from, message) => {
        if (message.cmd === CMD_ELECT_REQUEST) {
            this.elect(from, message);
        } else if (message.cmd === CMD_HEART_BEAT) {

        } else {
            console.log('warning wrong msg! ignored');
        }
    };

    this.start = () => this.startTimer();
    this.stop = () => clearTimeout(this.timer);
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

    this.sendHeart = (node) => {
        this.raft.transport.sendMessage(node.address, {
            cmd: CMD_HEART_BEAT,
            data: {}
        });
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

    this.start = () => this.timer = setInterval(() => this.raft.nodeConfig.nodes.forEach(this.sendHeart), HEART_INTERVAL);
    this.stop = () => clearInterval(this.timer);
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


    this.handleMessage = (from, message) => {
        if (message.cmd === CMD_ELECT_RSP) {
            if (message.data.support === 1 && this.raft.term === message.data.term) {
                this.voteNumber += 1;
            }
        } else if (message.cmd === CMD_HEART_BEAT) {
            this.raft.changeToFollower();
        } else {
            console.log('Warning error candidate message! Ignored!');
        }
    };
    this.electTimeout = () => {
        // more than half of nodes support me
        if (this.voteNumber * 2 > this.raft.nodeConfig.nodeNumbers) {
            this.raft.changeToLeader();
        } else {
            this.start();
        }
    };
    this.sendVoteRequest = (node) => {
        this.raft.transport.sendMessage(node.address, {
            cmd: CMD_ELECT_REQUEST,
            data: {
                term: this.raft.term, msgTerm: this.raft.logStore.msgTerm, msgIndex: this.raft.logStore.msgIndex
            }
        });
    };

    this.start = () => {
        //increase term
        this.raft.term += 1;
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