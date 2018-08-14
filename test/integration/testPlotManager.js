const PlotManager = artifacts.require('./PlotManager.sol');
const SpaceToken = artifacts.require('./SpaceToken.sol');
const SplitMerge = artifacts.require('./SplitMerge.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const galt = require('@galtproject/utils');
const { ether } = require('../helpers');

const web3 = new Web3(PlotManager.web3.currentProvider);

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

contract('PlotManager', ([deployer, alice, bob, charlie]) => {
  beforeEach(async function() {
    this.plotManager = await PlotManager.new({ from: deployer });
    this.spaceToken = await SpaceToken.new('Space Token', 'SPACE', { from: deployer });
    this.splitMerge = await SplitMerge.new({ from: deployer });

    await this.spaceToken.initialize(this.plotManager.address, 'SpaceToken', 'SPACE', { from: deployer });
    await this.spaceToken.setSplitMerge(this.splitMerge.address, { from: deployer });
    await this.plotManager.initialize(this.spaceToken.address, this.splitMerge.address, { from: deployer });
    await this.splitMerge.initialize(this.spaceToken.address, { from: deployer });

    this.plotManagerWeb3 = new web3.eth.Contract(this.plotManager.abi, this.plotManager.address);
    this.spaceTokenWeb3 = new web3.eth.Contract(this.spaceToken.abi, this.spaceToken.address);
  });

  describe('contract', () => {
    it.only('should provide methods to create and read an application', async function() {
      const initVertices = ['qwerqwerqwer', 'ssdfssdfssdf', 'zxcvzxcvzxcv'];
      const initLedgerIdentifier = 'шц50023中222ائِيل';

      const vertices = initVertices.map(galt.geohashToNumber);
      const credentials = web3.utils.sha3(`Johnj$Galt$123456po`);
      const ledgerIdentifier = web3.utils.utf8ToHex(initLedgerIdentifier);
      console.log('this.plotManager.applyForPlotOwnership', vertices);
      const res = await this.plotManager.applyForPlotOwnership(
        vertices,
        vertices[0].toString(10),
        credentials,
        ledgerIdentifier,
        web3.utils.asciiToHex('MN'),
        7,
        { from: alice, gas: 500000 }
      );

      const aId = res.logs[0].args.id;

      console.log('aId', aId);

      const res2 = await this.plotManagerWeb3.methods.getPlotApplication(aId).call();

      // assertions
      for (let i = 0; i < res2.vertices.length; i++) {
        galt.numberToGeohash(res2.vertices[i]).should.be.equal(initVertices[i]);
      }

      assert.equal(res2.status, 1);
      assert.equal(res2.precision, 7);
      assert.equal(res2.applicant.toLowerCase(), alice);
      assert.equal(web3.utils.hexToAscii(res2.country), 'MN');
      assert.equal(web3.utils.hexToUtf8(res2.ledgerIdentifier), initLedgerIdentifier);
    });

    // TODO: use actual SplitMerge functions in PlotManager for make the tests working again and unskip test
    it.skip('should mint package-token to SplitMerge contract', async function() {
      this.timeout(40000);
      const initVertices = ['qwerqwerqwer', 'ssdfssdfssdf', 'zxcvzxcvzxcv'];
      const initLedgerIdentifier = 'шц50023中222ائِيل';

      const vertices = initVertices.map(galt.geohashToNumber);
      const credentials = web3.utils.sha3(`Johnj$Galt$123456po`);
      const ledgerIdentifier = web3.utils.utf8ToHex(initLedgerIdentifier);
      let res = await this.plotManager.applyForPlotOwnership(
        vertices,
        vertices[0],
        credentials,
        ledgerIdentifier,
        web3.utils.asciiToHex('MN'),
        7,
        { from: alice, gas: 500000 }
      );

      const aId = res.logs[0].args.id;
      // console.log('Application ID:', aId);

      await this.plotManager.mintPack(aId, { from: alice });

      let geohashes = `gbsuv7ztt gbsuv7ztw gbsuv7ztx gbsuv7ztm gbsuv7ztq gbsuv7ztr gbsuv7ztj gbsuv7ztn`;
      geohashes += ` gbsuv7zq gbsuv7zw gbsuv7zy gbsuv7zm gbsuv7zt gbsuv7zv gbsuv7zk gbsuv7zs gbsuv7zu`;
      geohashes = geohashes.split(' ').map(galt.geohashToNumber);
      await this.plotManager.pushGeohashes(aId, geohashes, { from: alice });

      geohashes = `sezu7zht sezu7zhv sezu7zjj sezu7zhs sezu7zhu sezu7zjh sezu7zhe sezu7zhg sezu7zj5`;
      geohashes = geohashes.split(' ').map(galt.geohashToNumber);
      await this.plotManager.pushGeohashes(aId, geohashes, { from: alice });

      // Verify pre-swap state
      res = await this.plotManagerWeb3.methods.getPlotApplication(aId).call({ from: alice });

      let { packageToken, geohashTokens, status } = res;

      assert.equal(status, 1);

      res = await this.spaceToken.ownerOf.call(packageToken);
      assert.equal(res, this.splitMerge.address);

      let tasks = [];
      for (let i = 0; i < geohashTokens.length; i++) {
        tasks.push(this.spaceToken.ownerOf.call(geohashTokens[i]));
      }

      let results = await Promise.all(tasks);
      for (let i = 0; i < results.length; i++) {
        assert.equal(results[i], this.plotManager.address);
      }

      // Swap
      await this.plotManager.swapTokens(aId, { from: alice });

      // Verify after-swap state
      res = await this.plotManagerWeb3.methods.getPlotApplication(aId).call({ from: alice });

      ({ packageToken, geohashTokens, status } = res);

      assert.equal(status, 2);

      res = await this.spaceToken.ownerOf.call(res.packageToken);
      assert.equal(res, this.plotManager.address);

      tasks = [];
      for (let i = 0; i < geohashTokens.length; i++) {
        tasks.push(this.spaceToken.ownerOf.call(geohashTokens[i]));
      }

      results = await Promise.all(tasks);
      for (let i = 0; i < results.length; i++) {
        assert.equal(results[i], this.splitMerge.address);
      }

      // Submit
      await this.plotManager.submitApplication(aId, { from: alice, value: ether(1) });

      // Add Bob as a validator
      await this.plotManager.addValidator(bob, web3.utils.utf8ToHex('Bob'), web3.utils.utf8ToHex('ID'), {
        from: deployer
      });

      // Bob validates the application from Alice
      await this.plotManager.validateApplication(aId, true, { from: bob });

      res = await this.plotManagerWeb3.methods.getPlotApplication(aId).call({ from: charlie });
      assert.equal(res.status, 4);

      res = await this.spaceToken.totalSupply();
      assert.equal(res, 27);
    });
  });
});
