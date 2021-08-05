const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

// load utils
const { toTokens, fromTokens, getCurrentTime, checkEventEmitted } = require('../utils/test-utils');

chai.use(chaiAsPromised);

const AlefTokenContract = artifacts.require('AlefToken');
const AdonisArbitrageContract = artifacts.require('AdonisArbitrageFund');
const { assert } = chai;

// AdonisArbitrageFund contract test spec
contract('AdonisArbitrageFund', ([owner, bot, staker1, staker2, nonholder, receiver, spender]) => {
    let adonisArb;
    let now;
    let alefToken;

    // init contract instance for test session
    before(async() => {
        adonisArb = await AdonisArbitrageContract.deployed();
        alefToken = await AlefTokenContract.deployed();
        now = await getCurrentTime(500); // getting block timestamp and adding 10 seconds

        //transfer some aleftokens to stakers' accounts
        await alefToken.transfer(staker1, toTokens('1000000'), { from: owner });
        let staker1Bal = await alefToken.balanceOf(staker1);
        assert.ok(fromTokens(staker1Bal) > 0);

        await alefToken.transfer(staker2, toTokens('1000000'), { from: owner });
        let staker2Bal = await alefToken.balanceOf(staker2);
        assert.ok(fromTokens(staker2Bal) > 0);

        // padding bot with ALEF tokens
        await alefToken.transfer(bot, toTokens('1000000'), { from: owner });
        let botBal = await alefToken.balanceOf(bot);
        assert.ok(fromTokens(botBal) > 0);
    })

    // AdonisArbitrageFund has to have specific properties (totalSupply, name, decimal) that should be verified on deployment
    describe('AdonisArbitrageFund Deployment', async () => {

        // Check name and symbol
        it('Name is AdonisArbitrageFund and symbol is ADNS', async () => {
            let name = await adonisArb.name();
            let symbol = await adonisArb.symbol();
            assert.equal(name, 'AdonisArbitrageFund');
            assert.equal(symbol, 'ADNS');
        })

        // Check Initial supply, should be 0
        it('Has inital supply of 0', async () => {
            totalSupply = await adonisArb.totalSupply();
            assert.equal(totalSupply.toString(), toTokens('0'));
        })

        // Check decimals is accessible
        it('Decimals set to 18', async () => {
            decimals = await adonisArb.decimals();
            assert.equal(decimals.toString(), 18);
        })

        // Should have ownership renounced
        it('Should have ownership renounced - owner is address(0)', async () => {
            _owner = await adonisArb.owner();
            assert.equal(_owner, 0);
        })
    })

    /** Adonis Arbitrage Fund TESTING */

    // Funds Provision
    describe('Adonis Arbitrage ALEF Deposit', async () => {

        // Account should be able to supply initial ALEF fund
        it('Account should be able to supply initial ALEF fund', async () => {
            // assert no initial funds
            let adonisBalance = await adonisArb.getReserves();       
            assert.ok(fromTokens(adonisBalance['1']) == 0);
            assert.ok(fromTokens(adonisBalance['0']) == 0);

            // get approval and add liquidity
            await alefToken.approve(adonisArb.address, toTokens('500000'), { from: staker1 });
            await adonisArb.addToFund(toTokens('500000'), now, { from: staker1 });

            // check reserves for new liquidity
            adonisBalance = await adonisArb.getReserves();
            let adns = await adonisArb.balanceOf(staker1);

            // assert liquidity value
            assert.ok(fromTokens(adonisBalance['1']) == 500000);
            assert.ok(fromTokens(adonisBalance['0']) == 0);
            assert.ok(fromTokens(adns) == 500000);
        })

        // Account should be able to supply subsequent ALEF fund
        it('Account should be able to supply subsequent ALEF fund', async () => {
            // assert existing funds 
            let adonisBalance = await adonisArb.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);

            // get approval and add liquidity
            await alefToken.approve(adonisArb.address, toTokens('300000'), { from: staker2 });
            await adonisArb.addToFund(toTokens('300000'), now, { from: staker2 });

            // check reserves for new liquidity
            adonisBalance = await adonisArb.getReserves();
            let adns = await adonisArb.balanceOf(staker2);

            // assert liquidity value
            assert.ok(fromTokens(adonisBalance['1']) == 800000);
            assert.ok(fromTokens(adonisBalance['0']) == 0);
            assert.ok(fromTokens(adns) == 300000);
        })

        // Account that put in intial fund should be able to supply more funds & receive ADNS tokens per rata
        it('Account that put in intial fund should be able to supply more funds & receive ADNS tokens per rata', async () => {
            // assert initial funds
            let adonisBalance = await adonisArb.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);

            // get approval and add liquidity
            await alefToken.approve(adonisArb.address, toTokens('200000'), { from: staker1 });
            await adonisArb.addToFund(toTokens('200000'), now, { from: staker1 });

            // check reserves for new liquidity
            adonisBalance = await adonisArb.getReserves();
            let adns = await adonisArb.balanceOf(staker1);

            // assert liquidity value
            assert.ok(fromTokens(adonisBalance['1']) == 1000000);
            assert.ok(fromTokens(adonisBalance['0']) == 0);
            assert.ok(fromTokens(adns) == 700000);
        })

        // Account should not be able to supply funds if account has no tokens
        it('Account should not be able to supply funds if account has no tokens', async () => {
            // assert initial funds
            let adonisBalance = await adonisArb.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);

            // get approval and add liquidity
            let errMsg = "Account was able to supply funds when account had no tokens";
            await alefToken.approve(adonisArb.address, toTokens('200000'), { from: nonholder });
            await adonisArb.addToFund(toTokens('200000'), now, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // Stakers addresses should be added to array 
        it('Stakers addresses should be added to array', async () => {
            let hist1 = await adonisArb.isStakeholder(staker1);
            let hist2 = await adonisArb.isStakeholder(staker2);
            // assert stakeholders registered
            assert.ok(hist1['0']);
            assert.ok(hist2['0']);
        })
    })

    // BOT Interaction
    describe('Adonis Arbitrage Bot Interaction', async () => { 

        // Bot should be able to register trade and flag elligble tokens
        it('Bot should be able to register trade and flag elligble tokens', async () => { 
            // check fund > 0
            let totSup = await adonisArb.totalSupply();
            assert.ok(totSup > 0);

            // send ETH to contract
            await adonisArb.pay({from: bot, value: toTokens('50')});

            // pull ALEF from contract
            await adonisArb.approveBotFunds(toTokens('1000000'), { from: bot });
            await alefToken.transferFrom(adonisArb.address, bot, toTokens('500000'), { from: bot });

            // call register trade on contract
            let regRet = await adonisArb.registerTrade(toTokens('500000'), toTokens('50'), { from: bot });
            let ev = checkEventEmitted(regRet, 'RegisteredTrade');

            // assert registered trade
            assert.ok(fromTokens(ev.args.spentToken.toString()) == 500000);
            assert.ok(fromTokens(ev.args.boughtETH.toString()) == 50);

            // check total elligible ADNS
            let totElig = await adonisArb.totalElligebleSupply();
            assert.ok(fromTokens(totElig) == 500000);
        })

        // Staker 1 should have elligble tokens
        it('Staker 1 should have elligble tokens', async () => { 
            // check staker 1 elligible ADNS 350000
            let staker1elig = await adonisArb.accountElligebleToken(staker1)
            console.log(fromTokens(staker1elig));
            assert.ok(fromTokens(staker1elig) == 350000);
        })

        // Staker 2 should have elligble tokens
        it('Staker 2 should have elligble tokens', async () => { 
            // check staker 2 elligible ADNS 150000
            let staker2elig = await adonisArb.accountElligebleToken(staker2)
            assert.ok(fromTokens(staker2elig) == 150000);
        })
    })

    // Funds withdrawal
    describe('Adonis Arbitrage ALEF withdrawal', async () => {

        // Account should be able to withdraw from ALEF fund
        it('Account should be able to withdraw from ALEF fund', async () => { 
            // Check ADNS balance > 0
            let totSup = await adonisArb.totalSupply();
            assert.ok(totSup > 0);

            // withdraw ALEF from fund
            let tx = await adonisArb.withdrawFromFund(toTokens('100000'), now, { from: staker2 });
            let ev = checkEventEmitted(tx, 'Burn');

            // assert ALEF withdrawal
            assert.ok(from == staker2);
            assert.ok(fromTokens(ev.args.amount.toString()) == 100000);
            assert.ok(fromTokens(ev.args.amountETHOut.toString()) == 0);
            assert.ok(fromTokens(ev.args.amountTokenOut.toString()) == 100000);
        })

        // Account should not be able to burn elligble tokens for ALEF
        it('Account should not be able to burn elligble tokens for ALEF', async () => { 
            // Check ADNS balance > 0
            let totSup = await adonisArb.totalSupply();
            assert.ok(totSup > 0);

            // withdraw ALEF from fund with all ADNS (or >)
            let errMsg = "Account was able to withdraw ALEF with elligble ADNS";
            await adonisArb.withdrawFromFund(toTokens('100000'), now, { from: staker2 })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })

    // ETH claimes
    describe('Adonis Arbitrage ETH Claims', async () => {

        // Account should be able to claim ETH
        it('Account should be able to claim ETH', async () => { 
            // Check ADNS elligble balance > 0
            let staker1elig = await adonisArb.accountElligebleToken(staker1)
            assert.ok(fromTokens(staker1elig) == 350000);

            // claim ETH from fund
            let tx = await adonisArb.withdrawETH(toTokens('350000'), now, { from: staker1 });
            let ev = checkEventEmitted(tx, 'Burn');

            // assert ALEF withdrawal
            assert.ok(from == staker1);
            assert.ok(fromTokens(ev.args.amount.toString()) == 350000);
            assert.ok(fromTokens(ev.args.amountETHOut.toString()) == 35);
            assert.ok(fromTokens(ev.args.amountTokenOut.toString()) == 0);
        })

        // Account should not be able to redeem non-elligble tokens for ETH
        it('Account should not be able to redeem non-elligble tokens for ETH', async () => { 
            // Check ADNS elligble balance == 0
            let staker1elig = await adonisArb.accountElligebleToken(staker1)
            assert.ok(fromTokens(staker1elig) == 0);

            // claim ETH from fund
            let errMsg = "Account was able to withdraw ETH with non-elligble ADNS";
            await adonisArb.withdrawETH(toTokens('100000'), now, { from: staker1 })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })

    /** ADNS TOKEN TESTING */

    // ADNS has to be transferable between accounts
    describe('ADNS Transfers', async () => { 

        // NON-HOLDER should not be able to transfer any tokens
        it('NON-HOLDER can`t transfer tokens', async () => {
            errMsg = 'Account with no tokens was able to transfer tokens';
            await adonisArb.transfer(staker1, toTokens('100'), { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // HOLDER should successfully transfer their tokens
        it('HOLDER should successfully transfer their tokens', async () => {
            await adonisArb.transfer(receiver, toTokens('100'), { from: staker2 });
            let balance = await adonisArb.balanceOf(receiver);
            assert.equal(balance, toTokens('100'));
        })
    })

    // ADNS Allowance & Approvals
    describe('ADNS Allowance & Approvals', async () => {

        // Account should be able to set SPENDER and ALLOWANCE
        it('Account should be able to set SPENDER and ALLOWANCE', async () => {
            await adonisArb.approve(spender, toTokens('200'), { from: staker1 });
            allowance = await adonisArb.allowance(staker1, spender);
            assert.equal(allowance.toString(), toTokens('200'));
        })

        // Account should be able to increase/decrease allowance for spender
        it('Account should be able to set increase/decrease allowance for spender', async () => {
            await adonisArb.increaseAllowance(spender, toTokens('50'), { from: staker1 });
            allowance = await adonisArb.allowance(staker1, spender);
            assert.equal(allowance.toString(), toTokens('250'));

            await adonisArb.decreaseAllowance(spender, toTokens('50'), { from: staker1 });
            allowance = await adonisArb.allowance(staker1, spender);
            assert.equal(allowance.toString(), toTokens('200'));
        })

        // Account should be able to increase/decrease allowance for spender outside holder balance 
        it('Account should be able to increase/decrease allowance for spender outside holder balance', async () => {
            await adonisArb.increaseAllowance(spender, toTokens('50000000000000000'), { from: staker1 })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));

            await adonisArb.decreaseAllowance(spender, toTokens('50000000000000000'), { from: staker1 })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // SPENDER should be able to spend allowance
        it('SPENDER should be able to spend allowance', async () => {
            await adonisArb.transferFrom(staker1, receiver, toTokens('100'), { from: spender });
            allowance = await adonisArb.allowance(staker1, spender);
            assert.equal(allowance.toString(), toTokens('100'));
        })

        // SPENDER should not be able to spend more than allowance
        it('SPENDER should not be able to spend more than allowance', async () => {
            errMsg = 'SPENDER should not be able to spend more than allowance';
            await adonisArb.transferFrom(staker1, receiver, toTokens('100000'), { from: spender })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })
})