const Web3 = require('web3');

let web3;

module.exports = {
  initHelperWeb3(_web3) {
    web3 = new Web3(_web3.currentProvider);
  },
  zeroAddress: '0x0000000000000000000000000000000000000000',
  hex(input) {
    return web3.utils.toHex(input);
  },
  ether(number) {
    return web3.utils.toWei(number.toString(), 'ether');
  },
  async sleep(timeout) {
    return new Promise(resolve => {
      setTimeout(resolve, timeout);
    });
  },
  async assertRevert(promise) {
    try {
      await promise;
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert, `Expected throw, got '${error}' instead`);
      return;
    }
    assert.fail('Expected throw not received');
  },
  async printStorage(address, slotsToPrint) {
    assert(typeof address !== 'undefined');
    assert(address.length > 0);

    console.log('Storage listing for', address);
    for (let i = 0; i < (slotsToPrint || 20); i++) {
      console.log(`slot #${i}`, await web3.eth.getStorageAt(address, i));
    }
  }
};
