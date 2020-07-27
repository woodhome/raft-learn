
let transportMaps = {};

class TransPort  {
    constructor (address) {
        if (transportMaps[address]) {
            throw "Oh no repeated address!!!";
        }
        transportMaps[address] = this;
        this.address = address;
        this.onMessage = ()=>{};
    }
    sendMessage (address, message) {
        setTimeout(() => transportMaps[address].onMessage(this.address, message), Math.random() * 60);
    };
}
exports.TransPort = TransPort;