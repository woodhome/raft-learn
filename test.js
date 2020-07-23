
const Raft = require('./raft').Raft;
const TransPort = require('./transport').TransPort;
const LogStore = require('./logStore').LogStore;

let nodeConfig = {nodeNumbers:5,nodes:[{address:1},{address:2},{address:3},{address:4},{address:5}]};
let raftArr = [];
nodeConfig.nodes.forEach((node)=> raftArr.push(new Raft(new TransPort(node.address),new LogStore(),nodeConfig) ));

setInterval(()=>{
    raftArr.forEach((raft)=>{
        console.log(raft.dump());
    });
},2000);