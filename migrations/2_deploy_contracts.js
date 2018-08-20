const GaltToken = artifacts.require('./GaltToken');
const SpaceToken = artifacts.require('./SpaceToken');
const LandUtils = artifacts.require('./LandUtils');
const PlotManager = artifacts.require('./PlotManager');
const SplitMerge = artifacts.require('./SplitMerge');
const Web3 = require('web3');
const galt = require('@galtproject/utils');
// const AdminUpgradeabilityProxy = artifacts.require('zos-lib/contracts/upgradeability/AdminUpgradeabilityProxy.sol');

const fs = require('fs');

module.exports = async function(deployer, network, accounts) {
  if (network === 'test' || network === 'local' || network === 'development') {
    console.log('Skipping deployment migration');
    return;
  }

  deployer.then(async () => {
    const coreTeam = accounts[0];
    const alice = accounts[1];
      const bob = accounts[2];
    // const proxiesAdmin = accounts[1];

    // Deploy contracts...
    console.log('Deploy contracts...');
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
    await spaceToken.initialize('Space Token', 'SPACE', { from: coreTeam });
    await spaceToken.addRoleTo(plotManager.address, 'minter', { from: coreTeam });
    await spaceToken.addRoleTo(splitMerge.address, 'minter', { from: coreTeam });
    await spaceToken.addRoleTo(splitMerge.address, 'operator', { from: coreTeam });

    await splitMerge.initialize(spaceToken.address, plotManager.address, { from: coreTeam });

    await plotManager.initialize(
      Web3.utils.toWei('0.1', 'ether'),
      '25',
      coreTeam,
      spaceToken.address,
      splitMerge.address,
      {
        from: coreTeam
      }
    );

    await landUtils.initialize({ from: coreTeam });

    const jony = '0xf0430bbb78c3c359c22d4913484081a563b86170';
      await plotManager.addValidator(
          jony,
          Web3.utils.utf8ToHex('Jonybang'),
          Web3.utils.utf8ToHex('RU'),
          { from: coreTeam }
      );
    // await plotManager.addValidator(
    //     bob,
    //   Web3.utils.utf8ToHex('Jonybang'),
    //   Web3.utils.utf8ToHex('RU'),
    //   { from: coreTeam }
    // );
    //
    // const baseGeohash = galt.geohashToGeohash5('sezu06');
    // const res = await plotManager.applyForPlotOwnership(
    //   [baseGeohash, baseGeohash, baseGeohash, baseGeohash],
    //   baseGeohash,
    //     Web3.utils.sha3('111'),
    //     Web3.utils.utf8ToHex('111'),
    //     Web3.utils.asciiToHex('MN'),
    //   7,
    //   { from: alice, gas: 1000000, value: Web3.utils.toWei('0.1', 'ether') }
    // );
    //
    // const aId = res.logs[0].args.id;
    //
    // const application = await plotManager.getApplicationById(aId);
    //
    // await plotManager.submitApplication(aId, { from: alice });
    // await plotManager.lockApplicationForReview(aId, { from: bob });
    // await plotManager.approveApplication(aId, Web3.utils.sha3('111'), { from: bob });
    //
    // const packageTokenId = application[2].toString(10);
    // console.log('application.packageTokenId', packageTokenId);
    // await spaceToken.transferFrom(alice, bob, packageTokenId, { from: alice });

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
  });
};
