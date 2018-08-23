const PlotManager = artifacts.require('./PlotManager');
const GaltDex = artifacts.require('./GaltDex');
const Web3 = require('web3');
// const AdminUpgradeabilityProxy = artifacts.require('zos-lib/contracts/upgradeability/AdminUpgradeabilityProxy.sol');

const web3 = new Web3(PlotManager.web3.currentProvider);

const fs = require('fs');
const _ = require('lodash');

module.exports = async function(deployer, network, accounts) {
  if (network === 'test' || network === 'local_test' || network === 'development') {
    console.log('Skipping deployment migration');
    return;
  }

  const coreTeam = accounts[0];

  deployer.then(async () => {
    const data = JSON.parse(fs.readFileSync(`${__dirname}/../deployed/${network}.json`).toString());
    const plotManager = await PlotManager.at(data.plotManagerAddress);
    const galtDex = await GaltDex.at(data.galtDexAddress);

    const validators = {
      Jonybang: '0xf0430bbb78c3c359c22d4913484081a563b86170',
      Nikita: '0x8d362af4c86b05d6F256147A6E76b9d7aF205A24',
      Igor: '0x06dba6eb6a1044b8cbcaa0033ea3897bf37e6671',
      Nik: '0x486129f16423bb74786abc99eab06897f73310f5',
      Nik2: '0x83d61498cc955c4201042f12bd34e818f781b90b'
    };

    const rewarder = accounts[3] || accounts[2] || accounts[1] || accounts[0];

    const sendEthByNetwork = {
      local: 100000,
      testnet56: 1000,
      testnet57: 1000,
      development: 20,
      ganache: 20,
      production: 0
    };

    const promises = [];
    _.forEach(validators, (address, name) => {
      promises.push(
        plotManager.addValidator(address, Web3.utils.utf8ToHex(name), Web3.utils.utf8ToHex('RU'), {
          from: coreTeam
        })
      );

      promises.push(galtDex.addRoleTo(address, 'fee_manager', { from: coreTeam }));
      promises.push(plotManager.addRoleTo(address, 'fee_manager', { from: coreTeam }));

      if (!sendEthByNetwork[network]) {
        return;
      }

      const sendWei = web3.utils.toWei(sendEthByNetwork[network].toString(), 'ether').toString(10);
      promises.push(web3.eth.sendTransaction({ from: rewarder, to: address, value: sendWei }).catch(() => {}));
    });

    await Promise.all(promises);
  });
};
