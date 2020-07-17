
let transportMaps = {};

let TransPort = function (address) {
    if (transportMaps[address]) {
        throw "Oh no repeated address!!!";
    }
    this.onMessage = () => {
    };
    transportMaps[address] = this;
    this.address = address;


    this.sendMessage = (address, message) => {
        console.log('send message to : ' + address);
        console.log(message);
        setTimeout(() => transportMaps[address].onMessage(this.address, message), Math.random() * 50);
    };
};
exports.TransPort = TransPort;