
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
        setTimeout(() => transportMaps[address].onMessage(this.address, message), Math.random() * 10);
    };
};
exports.TransPort = TransPort;