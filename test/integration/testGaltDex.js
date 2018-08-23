const GaltToken = artifacts.require('./GaltToken.sol');
const GaltDex = artifacts.require('./GaltDex.sol');
const Web3 = require('web3');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const chaiBigNumber = require('chai-bignumber')(Web3.utils.BN);
const galt = require('@galtproject/utils');
const { initHelperWeb3, ether, szabo, assertRevert, zeroAddress } = require('../helpers');

const web3 = new Web3(GaltToken.web3.currentProvider);
initHelperWeb3(web3);
const { BN } = Web3.utils;

// TODO: move to helpers
Web3.utils.BN.prototype.equal = Web3.utils.BN.prototype.eq;
Web3.utils.BN.prototype.equals = Web3.utils.BN.prototype.eq;

chai.use(chaiAsPromised);
chai.use(chaiBigNumber);
chai.should();

/**
 * Alice is an applicant
 * Bob is a validator
 */
contract('GaltDex', ([coreTeam, galtSpaceOrg, alice, bob, charlie]) => {
  const fee = 15;

  beforeEach(async function() {
    this.galtToken = await GaltToken.new({ from: coreTeam });
    this.galtDex = await GaltDex.new({ from: coreTeam });

    await this.galtDex.initialize(szabo(1), fee.toString(10), fee.toString(10), this.galtToken.address, {
      from: coreTeam
    });

    this.galtDex.addRoleTo(galtSpaceOrg, 'fee_manager');

    await this.galtToken.mint(this.galtDex.address, ether(100));

    this.showGaltDexStatus = async function() {
      const totalSupply = (await this.galtToken.totalSupply()) / Math.pow(10, 18);
      const galtBalanceOfGaltDex = (await this.galtToken.balanceOf(this.galtDex.address)) / Math.pow(10, 18);
      const totalSupplyMinusGaltBalance = totalSupply - galtBalanceOfGaltDex;
      const ethBalanceOfGaltDex = (await web3.eth.getBalance(this.galtDex.address)) / Math.pow(10, 18);
      const exchangeRate = (await this.galtDex.exchangeRate('0')) / Math.pow(10, 12);

      console.log(
        'totalSupply',
        totalSupply.toString(10),
        'galtBalanceOfGaltDex',
        galtBalanceOfGaltDex.toString(10),
        'totalSupplyMinusGaltBalance',
        totalSupplyMinusGaltBalance.toString(10),
        'ethBalanceOfGaltDex',
        ethBalanceOfGaltDex.toString(10),
        'exchangeRate',
        exchangeRate.toString(10)
      );
    };

    this.showGaltDexStatus.bind(this);
  });

  it('should be initialized successfully', async function() {
    (await this.galtDex.baseExchangeRate()).toString(10).should.be.eq(szabo(1).toString(10));
    (await this.galtDex.galtFee()).toString(10).should.be.eq((15).toString(10));
    (await this.galtDex.ethFee()).toString(10).should.be.eq((15).toString(10));
  });

  describe('#buyGalt()', async () => {
    const ethToSend = parseInt(ether(10), 10);
    const shouldEthFee = (ethToSend / 100) * fee;
    const galtShouldReceive = ethToSend;

    const galtToSend = ethToSend / 4;
    const shouldGaltFee = (galtToSend / 100) * fee;
    const ethShouldReceive = galtToSend;

    beforeEach(async function() {
      const ethFeeForAmount = await this.galtDex.getEthFeeForAmount(ethToSend, { from: alice });
      ethFeeForAmount.toString(10).should.be.eq(shouldEthFee.toString(10));

      const galtToReceive = await this.galtDex.getExchangeEthAmountForGalt(ethToSend, { from: alice });
      galtToReceive.toString(10).should.be.eq(galtShouldReceive.toString(10));

      await this.galtDex.exchangeEthToGalt({ from: alice, value: ethToSend });
    });

    it('should be correct balance on buy', async function() {
      // this.showGaltDexStatus();

      let galtBalance = (await this.galtToken.balanceOf(alice)).toString(10);
      // console.log(`eth sent     ${ethToSend}`);
      // console.log(`galt balance ${galtBalance}`);
      galtBalance.should.be.eq(galtShouldReceive.toString(10));

      (await web3.eth.getBalance(this.galtDex.address)).toString(10).should.be.eq(ethToSend.toString(10));

      (await this.galtDex.ethToGaltSum()).toString(10).should.be.eq(ethToSend.toString(10));

      await this.galtDex.exchangeEthToGalt({ from: alice, value: ethToSend });

      // this.showGaltDexStatus();

      galtBalance = (await this.galtToken.balanceOf(alice)).toString(10);
      // console.log(`eth sent     ${ethToSend}`);
      // console.log(`galt balance ${galtBalance}`);
      galtBalance.should.be.eq((galtShouldReceive * 2).toString(10));

      (await web3.eth.getBalance(this.galtDex.address)).toString(10).should.be.eq((ethToSend * 2).toString(10));

      (await this.galtDex.ethToGaltSum()).toString(10).should.be.eq((ethToSend * 2).toString(10));
    });

    it('should exchange back to eth', async function() {
      const galtBalance = await this.galtToken.balanceOf(alice);

      const aliceBalance = await web3.eth.getBalance(alice);
      // console.log(`aliceBalance before: ${aliceBalance / Math.pow(10, 18)}`);

      await this.galtToken.approve(this.galtDex.address, galtToSend, { from: alice });

      const allowance = await this.galtToken.allowance(alice, this.galtDex.address);
      allowance.toString(10).should.be.eq(galtToSend.toString(10));

      await this.galtDex.exchangeGaltToEth(galtToSend, { from: alice });
      // console.log(`aliceBalance after: ${(await web3.eth.getBalance(alice)) / Math.pow(10, 18)}`);

      const aliceBalanceDiff = (await web3.eth.getBalance(alice)) - aliceBalance;

      (ethShouldReceive - aliceBalanceDiff).should.be.lt(parseInt(ether(0.02), 10));

      const galtBalanceAfterExchange = await this.galtToken.balanceOf(alice);

      (galtBalance - galtBalanceAfterExchange).toString(10).should.be.eq(galtToSend.toString(10));

      (await this.galtDex.galtToEthSum()).toString(10).should.be.eq(galtToSend.toString(10));
    });

    it('should receive fee', async function() {
      await this.galtToken.approve(this.galtDex.address, galtToSend, { from: alice });
      await this.galtDex.exchangeGaltToEth(galtToSend, { from: alice });

      let ethFeePayout = await this.galtDex.ethFeePayout();
      ethFeePayout.toString(10).should.be.eq(shouldEthFee.toString(10));

      const galtSpaceOrgEthBalance = await web3.eth.getBalance(galtSpaceOrg);
      await this.galtDex.withdrawEthFee({ from: galtSpaceOrg });
      const galtSpaceOrgEthBalanceProfit = (await web3.eth.getBalance(galtSpaceOrg)) - galtSpaceOrgEthBalance;

      (shouldEthFee - galtSpaceOrgEthBalanceProfit).should.be.lt(parseInt(ether(0.005), 10));

      ethFeePayout = await this.galtDex.ethFeePayout();
      ethFeePayout.toString(10).should.be.eq((0).toString(10));

      const totalEthFeePayout = await this.galtDex.ethFeeTotalPayout();
      totalEthFeePayout.toString(10).should.be.eq(shouldEthFee.toString(10));

      let galtFeePayout = await this.galtDex.galtFeePayout();
      galtFeePayout.toString(10).should.be.eq(shouldGaltFee.toString(10));

      await this.galtDex.withdrawGaltFee({ from: galtSpaceOrg });
      const galtSpaceOrgGaltBalance = await this.galtToken.balanceOf(galtSpaceOrg);

      galtSpaceOrgGaltBalance.toString(10).should.be.eq(shouldGaltFee.toString(10));

      galtFeePayout = await this.galtDex.galtFeePayout();
      galtFeePayout.toString(10).should.be.eq((0).toString(10));

      const totalGaltFeePayout = await this.galtDex.galtFeeTotalPayout();
      totalGaltFeePayout.toString(10).should.be.eq(shouldGaltFee.toString(10));
    });
  });
});
