const PlotManager = artifacts.require('./PlotManager');
const Web3 = require('web3');
// const AdminUpgradeabilityProxy = artifacts.require('zos-lib/contracts/upgradeability/AdminUpgradeabilityProxy.sol');

const fs = require('fs');

module.exports = async function(deployer, network, accounts) {
  if (network === 'test' || network === 'development') {
    console.log('Skipping deployment migration');
    return;
  }
  const coreTeam = accounts[0];

  deployer.then(async () => {
    const data = JSON.parse(fs.readFileSync(`${__dirname}/../deployed/${network}.json`).toString());
    const plotManager = await PlotManager.at(data.plotManagerAddress);

    const jony = '0xf0430bbb78c3c359c22d4913484081a563b86170';
    await plotManager.addValidator(jony, Web3.utils.utf8ToHex('Jonybang'), Web3.utils.utf8ToHex('RU'), {
      from: coreTeam
    });

    const nikita = '0x8d362af4c86b05d6F256147A6E76b9d7aF205A24';
    await plotManager.addValidator(nikita, Web3.utils.utf8ToHex('Nikita'), Web3.utils.utf8ToHex('RU'), {
      from: coreTeam
    });

    const igor = '0x06dba6eb6a1044b8cbcaa0033ea3897bf37e6671';
    await plotManager.addValidator(igor, Web3.utils.utf8ToHex('Igor'), Web3.utils.utf8ToHex('RU'), {
      from: coreTeam
    });

    const nik1 = '0xE46c088b5DD483cDa2400EE70296baD4903fC845';
    await plotManager.addValidator(nik1, Web3.utils.utf8ToHex('Nik'), Web3.utils.utf8ToHex('RU'), {
      from: coreTeam
    });

    const nik2 = '0x83d61498cc955c4201042f12bd34e818f781b90b';
    await plotManager.addValidator(nik2, Web3.utils.utf8ToHex('Nik'), Web3.utils.utf8ToHex('RU'), {
      from: coreTeam
    });
  });
};
