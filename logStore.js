/**
 * The LogStore store log in order(term,logIndex)
 * example
 * [(0,1,data),(0,2,data),(1,0,data),(1,2,data),(1,3,data),(3,0,data),(3,1,data)]
 */
class LogStore{
    constructor (){
        this.logs = [];
    }

    lastLog(){
        return this.logs.length === 0 ? {term: 0,logIndex: 0} : this.logs[this.logs.length-1];
    }

    addLog (term,logIndex,data){
        this.logs.push({term:term,logIndex:logIndex,data:data,committed:false});
    }

    commitLog(term,logIndex){
        let i = this.binarySearch(term,logIndex);
        if(i === -1){
            console.log('logStore error : commit log not in store!!');
        }else{
            this.logs[i].committed = true;
        }
    }

    /**
     * remove all log after the log(term,logIndex)
     * @param term
     * @param logIndex
     */
    removeLogAfter(term,logIndex){
        let i = this.binarySearch(term,logIndex);
        if(i === -1){
            console.log('logStore error : removeLogAfter log not in store!!');
        }else {
            this.logs = this.logs.slice(0,i);
        }
    }

    binarySearch(term,logIndex){
        let high = this.logs.length-1,low=0;
        while(low <= high){
            let mid = low + (high - low) / 2;
            let log = this.logs[mid];
            if(log.term === term && log.logIndex === logIndex){
                return mid;
            }else if(log.term < term || (log.term===term && log.logIndex < logIndex)){
                low = mid + 1;
            }else{
                high = mid - 1;
            }
        }
        return -1;
    }
}

exports.LogStore = LogStore;