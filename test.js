
const Raft = require('./raft').Raft;
const TransPort = require('./transport').TransPort;
const LogStore = require('./logStore').LogStore;

let nodeConfig = {nodeNumbers:5,nodes:[{address:1},{address:2},{address:3},{address:4},{address:5}]};
let raftArr = [];
nodeConfig.nodes.forEach((node)=> raftArr.push(new Raft(new TransPort(node.address),new LogStore(),nodeConfig) ));

count = 0;
setInterval(()=>{
    raftArr.forEach((raft)=>{
        console.log(raft.dump());
    });
    let data = 'data_'+count;
    let res = raftArr[0].request(data);
    if(res.error === -1){
        console.log(res);
        console.log('follower request!!');
        raftArr.forEach((raft)=>{
            if(raft.transport.address === res.leader){
                raft.request(data);
            }
        });
    }else if(res.error === -2){
        console.log('candidate request!');
    }else {
        console.log('leader request!!');
    }
    count++;
},2000);