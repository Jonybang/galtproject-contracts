const GaltToken = artifacts.require('./GaltToken');
const SpaceToken = artifacts.require('./SpaceToken');
const LandUtils = artifacts.require('./LandUtils');
const PlotManager = artifacts.require('./PlotManager');
const SplitMerge = artifacts.require('./SplitMerge');
const Web3 = require('web3');
// const AdminUpgradeabilityProxy = artifacts.require('zos-lib/contracts/upgradeability/AdminUpgradeabilityProxy.sol');

const fs = require('fs');

module.exports = async function(deployer, network, accounts) {
  if (network === 'test' || network === 'local' || network === 'development') {
    console.log('Skipping deployment migration');
    return;
  }

  const coreTeam = accounts[0];
  // const proxiesAdmin = accounts[1];

  // Deploy contracts...
  const galtToken = await GaltToken.new({ from: coreTeam });
  const spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: coreTeam });
  const splitMerge = await SplitMerge.new({ from: coreTeam });
  const plotManager = await PlotManager.new({ from: coreTeam });
  const landUtils = await LandUtils.new({ from: coreTeam });

  // Setup proxies...
  // NOTICE: The address of a proxy creator couldn't be used in the future for logic contract calls.
  // https://github.com/zeppelinos/zos-lib/issues/226
  // const spaceTokenProxy = await AdminUpgradeabilityProxy.new(SpaceToken.address, { from: proxiesAdmin });
  // const splitMergeProxy = await AdminUpgradeabilityProxy.new(SplitMerge.address, { from: proxiesAdmin });
  // const plotManagerProxy = await AdminUpgradeabilityProxy.new(PlotManager.address, { from: proxiesAdmin });
  // const landUtilsProxy = await AdminUpgradeabilityProxy.new(LandUtils.address, { from: proxiesAdmin });
  //
  // // Instantiate logic contract at proxy addresses...
  // await SpaceToken.at(spaceTokenProxy.address);
  // await SplitMerge.at(splitMergeProxy.address);
  // await PlotManager.at(plotManagerProxy.address);
  // await LandUtils.at(landUtilsProxy.address);

  // Call initialize methods (constructor substitute for proxy-backed contract)
  await spaceToken.initialize(plotManager.address, 'Space Token', 'SPACE', { from: coreTeam });
  await spaceToken.setSplitMerge(splitMerge.address, { from: coreTeam });

  await splitMerge.initialize(spaceToken.address, { from: coreTeam });
  await splitMerge.setPlotManager(plotManager.address, { from: coreTeam });

  await plotManager.initialize(spaceToken.address, splitMerge.address, { from: coreTeam });

  await landUtils.initialize({ from: coreTeam });

  await plotManager.addValidator(
    '0xf0430bbb78c3c359c22d4913484081a563b86170',
    Web3.utils.utf8ToHex('Jonybang'),
    Web3.utils.utf8ToHex('RU'),
    { from: coreTeam }
  );

  await new Promise(resolve => {
    fs.writeFile(
      `${__dirname}/../deployed_${network}.json`,
      JSON.stringify(
        {
          galtTokenAddress: galtToken.address,
          galtTokenAbi: galtToken.abi,
          spaceTokenAddress: spaceToken.address,
          spaceTokenAbi: spaceToken.abi,
          splitMergeAddress: splitMerge.address,
          splitMergeAbi: splitMerge.abi,
          plotManagerAddress: plotManager.address,
          plotManagerAbi: plotManager.abi,
          landUtilsAddress: landUtils.address,
          landUtilsAbi: landUtils.abi
        },
        null,
        2
      ),
      resolve
    );
  });

  // Log out proxy addresses
  console.log('SpaceToken Proxy:', spaceToken.address);
  console.log('SplitMerge Proxy:', splitMerge.address);
  console.log('PlotManager Proxy:', plotManager.address);
  console.log('LandUtils Proxy:', landUtils.address);
};
