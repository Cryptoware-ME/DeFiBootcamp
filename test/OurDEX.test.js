const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

// load utils
const { toTokens, fromTokens, getCurrentTime, checkEventEmitted } = require('../utils/test-utils');

chai.use(chaiAsPromised);

const AdonisDEXContract = artifacts.require('AdonisDEX');
const AlefTokenContract = artifacts.require('AlefToken');
const { assert } = chai;

// AdonisDEX contract test spec
contract('AdonisDEX', ([owner, lp1, lp2, swaper1, swaper2, nonholder1, spender]) => {
    let adonisDEX;
    let now;
    let alefToken;

    // init contract instance for test session
    before(async() => {
        adonisDEX = await AdonisDEXContract.deployed();
        alefToken = await AlefTokenContract.deployed();
        now = await getCurrentTime(500); // getting block timestamp and adding 10 seconds

        //transfer some aleftokens to liquidity provider accounts
        await alefToken.transfer(lp1, toTokens('1000000'), { from: owner });
        let lp1Bal = await alefToken.balanceOf(lp1);
        assert.ok(fromTokens(lp1Bal) > 0);

        await alefToken.transfer(lp2, toTokens('1000000'), { from: owner });
        let lp2Bal = await alefToken.balanceOf(lp2);
        assert.ok(fromTokens(lp2Bal) > 0);

        //transfer some aleftokens to swappers accounts
        await alefToken.transfer(swaper1, toTokens('500000'), { from: owner });
        let sw1bal = await alefToken.balanceOf(swaper1);
        assert.ok(fromTokens(sw1bal) > 0);

        await alefToken.transfer(swaper2, toTokens('500000'), { from: owner });
        let sw2bal = await alefToken.balanceOf(swaper2);
        assert.ok(fromTokens(sw2bal) > 0);
    })

    // AdonisDEX has to have specific properties (totalSupply, name, decimal) that should be verified on deployment
    describe('AdonisDEX Deployment', async () => {

        // Check name and symbol
        it('Name is AdonisDEX and symbol is ADNX', async () => {
            let name = await adonisDEX.name();
            let symbol = await adonisDEX.symbol();
            assert.equal(name, 'AdonisDEX');
            assert.equal(symbol, 'ADNX');
        })

        // Check Initial supply, should be 0
        it('Has inital supply of 0', async () => {
            totalSupply = await adonisDEX.totalSupply();
            assert.equal(totalSupply.toString(), toTokens('0'));
        })

        // Check decimals is accessible
        it('Decimals set to 18', async () => {
            decimals = await adonisDEX.decimals();
            assert.equal(decimals.toString(), 18);
        })

        // Should have ownership renounced
        it('Should have ownership renounced - owner is address(0)', async () => {
            _owner = await adonisDEX.owner();
            assert.equal(_owner, 0);
        })
    })

    /** ADONIS DEX TESTING */

    // Liquidity Provision
    describe('ADONIS DEX Liquidity provision', async () => {

        // Account should be able to supply initial liquidity & receive ADNX tokens
        it('Account should be able to supply initial liquidity & receive ADNX tokens', async () => {
            // assert no initial liquidity
            let adonisBalance = await adonisDEX.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) == 0);
            assert.ok(fromTokens(adonisBalance['0']) == 0);

            // get approval and add liquidity
            await alefToken.approve(adonisDEX.address, toTokens('500000'), { from: lp1 });
            await adonisDEX.addLiquidity(toTokens('500000'), toTokens('550000'), toTokens('450000'), now, { from: lp1, value: toTokens('50') });

            // check reserves for new liquidity
            adonisBalance = await adonisDEX.getReserves();
            let adnx = await adonisDEX.balanceOf(lp1);

            // assert liquidity value
            assert.ok(fromTokens(adonisBalance['1']) == 500000);
            assert.ok(fromTokens(adonisBalance['0']) == 50);
            assert.ok(fromTokens(adnx) == 5000);
        })

        // Account should be able to supply subsequent liquidity & receive ADNX tokens per rata
        it('Account should be able to supply subsequent liquidity & receive ADNX tokens per rata', async () => {
            // assert existing liquidity 
            let adonisBalance = await adonisDEX.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);
            assert.ok(fromTokens(adonisBalance['0']) > 0);

            // getting required ALEF and potential minted ADNX for 27 ETH
            let resp = await adonisDEX.calcLiquidityRequirementETH(toTokens('27'));
            assert.ok(fromTokens(resp['_reqETH']) == 27);
            assert.ok(fromTokens(resp['_reqALEF']) == 270000);
            assert.ok(fromTokens(resp['_mintedADNX']) == 2700);

            // providing second liquidity
            await alefToken.approve(adonisDEX.address, toTokens('270000'), { from: lp2 });
            await adonisDEX.addLiquidity(toTokens('270000'), toTokens('300000'), toTokens('270000'), now, { from: lp2, value: toTokens('27') });
            
            // checking reserves for updated liquidity
            adonisBalance = await adonisDEX.getReserves();
            let adnx = await adonisDEX.totalSupply();

            // assert values          
            assert.ok(fromTokens(adonisBalance['1']) == 770000);
            assert.ok(fromTokens(adonisBalance['0']) == 77);
            assert.ok(fromTokens(adnx) == 7700);
        })

        // Account that put in intial liquidity should be able to supply more liquidity & receive ADNX tokens per rata
        it('Account that put in intial liquidity should be able to supply more liquidity & receive ADNX tokens per rata', async () => {
            // assert existing liquidity 
            let adonisBalance = await adonisDEX.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);
            assert.ok(fromTokens(adonisBalance['0']) > 0);

            // getting required ALEF and potential minted ADNX for 27 ETH
            let resp = await adonisDEX.calcLiquidityRequirementETH(toTokens('48'));
            assert.ok(fromTokens(resp['_reqETH']) == 48);
            assert.ok(fromTokens(resp['_reqALEF']) == 480000);
            assert.ok(fromTokens(resp['_mintedADNX']) == 4800);

            // providing third liquidity
            await alefToken.approve(adonisDEX.address, toTokens('480000'), { from: lp1 });
            await adonisDEX.addLiquidity(toTokens('480000'), toTokens('500000'), toTokens('480000'), now, { from: lp1, value: toTokens('48') });
            
            // checking reserves for updated liquidity
            adonisBalance = await adonisDEX.getReserves();
            let adnx = await adonisDEX.totalSupply();

            // assert values          
            assert.ok(fromTokens(adonisBalance['1']) == 1250000);
            assert.ok(fromTokens(adonisBalance['0']) == 125);
            assert.ok(fromTokens(adnx) == 12500);
        })

        // Account should not be able to supply liquidity if account has no funds
        it('Account should not be able to supply liquidity if account has no funds', async () => {
            // assert existing liquidity 
            let adonisBalance = await adonisDEX.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);
            assert.ok(fromTokens(adonisBalance['0']) > 0);

            // getting required ALEF and potential minted ADNX for 5 ETH
            let resp = await adonisDEX.calcLiquidityRequirementETH(toTokens('5'));
            assert.ok(fromTokens(resp['_reqETH']) == 5);
            assert.ok(fromTokens(resp['_reqALEF']) == 50000);
            assert.ok(fromTokens(resp['_mintedADNX']) == 500);

            // providing third liquidity
            errMsg = "Account was able to supply liquidity when account had no funds";
            await alefToken.approve(adonisDEX.address, toTokens('50000'), { from: nonholder1 });
            await adonisDEX.addLiquidity(toTokens('50000'), toTokens('60000'), toTokens('50000'), now, { from: nonholder1, value: toTokens('5') })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // Liquidity history should be accessible for liquidity provider
        it('Liquidity history should be accessible for liquidity provider', async () => {
            let hist = await adonisDEX.getAccountLiquidityHistory(lp1, { from: lp1 });
            
            // assert first deposit data
            assert.ok(hist[0].isdeposit);
            assert.ok(hist[0].amountETH == toTokens('50'));
            assert.ok(hist[0].amountALEF == toTokens('500000'));

            // assert second deposit data
            assert.ok(hist[1].isdeposit);
            assert.ok(hist[1].amountETH == toTokens('48'));
            assert.ok(hist[1].amountALEF == toTokens('480000'));
        })
    })

    // Liquidity Withdrawal
    describe('ADONIS DEX Liquidity withdrawal', async () => {

        // Holder should be able to see the value of his ADNX as shares of ETH and ALEF from the pool
        it('Holder should be able to see the value of his ADNX as shares of ETH and ALEF from the pool', async () => {
            let onBurnValue = await adonisDEX.calculateOnBurnValue(toTokens('5000'), { from: lp1 });
            assert.ok(fromTokens(onBurnValue.amountETH) == 50);
            assert.ok(fromTokens(onBurnValue.amountALEF) == 500000);
        })

        // Account should be able to burn their ADNX and withdraw ETH and ALEF
        it('Account should be able to burn their ADNX and withdraw ETH and ALEF', async () => {
            // assert liquidity available
            let adonisBalance = await adonisDEX.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);
            assert.ok(fromTokens(adonisBalance['0']) > 0);

            // remove liquidity
            await adonisDEX.removeLiquidity(toTokens('5000'), now, { from: lp1 });

            // check reserves for new liquidity
            adonisBalance = await adonisDEX.getReserves();
            let adnx = await adonisDEX.balanceOf(lp1);

            // assert liquidity value
            assert.ok(fromTokens(adonisBalance['1']) == 750000);
            assert.ok(fromTokens(adonisBalance['0']) == 75);
            assert.ok(fromTokens(adnx) == 4800);
        })

        // Account should not be able to burn more ADNX than they have
        it('Account should not be able to burn more ADNX than they have', async () => {
            // assert liquidity available
            let adonisBalance = await adonisDEX.getReserves();            
            assert.ok(fromTokens(adonisBalance['1']) > 0);
            assert.ok(fromTokens(adonisBalance['0']) > 0);

            // remove liquidity
            errMsg = "Account was able to burn more ADNX than they have";
            await adonisDEX.removeLiquidity(toTokens('3000'), now, { from: lp2 })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // Liquidity history should be updated post-withdrawal
        it('Liquidity history should be updated post-withdrawal', async () => {
            let hist = await adonisDEX.getAccountLiquidityHistory(lp1, { from: lp1 });
            
            // assert first deposit data
            assert.ok(!hist[2].isdeposit);
            assert.ok(hist[2].amountETH == toTokens('50'));
            assert.ok(hist[2].amountALEF == toTokens('500000'));
        })
    })

    // Swaping
    describe('ADONIS DEX Swaps', async () => {

        // Get quote for ETH->ALEF
        it('Get quote for ETH->ALEF', async () => {
            let quote = await adonisDEX.getQuoteForALEF(toTokens('7.5'), { from: swaper1 });
            assert.ok(fromTokens(quote) >= 67933);
        })

        // Get reverse quote for ETH->ALEF
        it('Get reverse quote for ETH->ALEF', async () => {
            let quote = await adonisDEX.getReverseQuoteForALEF(toTokens('67933'), { from: swaper1 });
            assert.ok(fromTokens(quote) >= 7.4);
        })

        // Get quote for ALEF->ETH
        it('Get quote for ALEF->ETH', async () => {
            let quote = await adonisDEX.getQuoteForETH(toTokens('70000'), { from: swaper1 });
            assert.ok(fromTokens(quote) >= 6.3);
        })

        // Get reverse quote for ALEF->ETH
        it('Get reverse quote for ALEF->ETH', async () => {
            let quote = await adonisDEX.getReverseQuoteForETH(toTokens('7'), { from: swaper1 });
            assert.ok(fromTokens(quote) >= 77000);
        })

        // Attempt buy ALEF successfully
        it('Attempt buy ALEF successfully', async () => {
            let tx = await adonisDEX.buyALEF(toTokens('70000'), toTokens('60000'), now, { from: swaper1, value: toTokens('7.5') });
            let ev = checkEventEmitted(tx, 'Swap');

            assert.ok(ev.args.swapout['currency'].toString() !== "0x0000000000000000000000000000000000000000");
            assert.ok(fromTokens(ev.args.swapout['amount'].toString()) >= 60000);
            assert.ok(fromTokens(ev.args.swapout['amount'].toString()) <= 70000);
        })

        // Attempt buy ETH successfully
        it('Attempt buy ETH successfully', async () => {
            await alefToken.approve(adonisDEX.address, toTokens('50000'), { from: swaper1 });
            let tx = await adonisDEX.sellALEF(toTokens('50000'), toTokens('6'), toTokens('4'), now, { from: swaper1 });
            let ev = checkEventEmitted(tx, 'Swap');

            assert.ok(ev.args.swapout['currency'].toString() === "0x0000000000000000000000000000000000000000");
            assert.ok(fromTokens(ev.args.swapout['amount'].toString()) >= 4);
            assert.ok(fromTokens(ev.args.swapout['amount'].toString()) <= 8);
        })
    })

    /** ADNX TOKEN TESTING */

    // ADNX has to be transferable between accounts
    describe('ADNX Transfers', async () => { 

        // NON-HOLDER should not be able to transfer any tokens
        it('NON-HOLDER can`t transfer tokens', async () => {
            errMsg = 'Account with no tokens was able to transfer tokens';
            await adonisDEX.transfer(lp1, toTokens('100'), { from: nonholder1 })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // HOLDER should successfully transfer their tokens
        it('HOLDER should successfully transfer their tokens', async () => {
            await adonisDEX.transfer(swaper1, toTokens('100'), { from: lp1 });
            let balance = await adonisDEX.balanceOf(swaper1);
            assert.equal(balance, toTokens('100'));
        })
    })

    // ADNX Allowance & Approvals
    describe('ADNX Allowance & Approvals', async () => {

        // Account should be able to set SPENDER and ALLOWANCE
        it('Account should be able to set SPENDER and ALLOWANCE', async () => {
            await adonisDEX.approve(spender, toTokens('200'), { from: lp1 });
            allowance = await adonisDEX.allowance(lp1, spender);
            assert.equal(allowance.toString(), toTokens('200'));
        })

        // Account should be able to increase/decrease allowance for spender
        it('Account should be able to set increase/decrease allowance for spender', async () => {
            await adonisDEX.increaseAllowance(spender, toTokens('50'), { from: lp1 });
            allowance = await adonisDEX.allowance(lp1, spender);
            assert.equal(allowance.toString(), toTokens('250'));

            await adonisDEX.decreaseAllowance(spender, toTokens('50'), { from: lp1 });
            allowance = await adonisDEX.allowance(lp1, spender);
            assert.equal(allowance.toString(), toTokens('200'));
        })

        // Account should be able to increase/decrease allowance for spender outside holder balance 
        it('Account should be able to increase/decrease allowance for spender outside holder balance', async () => {
            await adonisDEX.increaseAllowance(spender, toTokens('50000000000000000'), { from: lp1 })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));

            await adonisDEX.decreaseAllowance(spender, toTokens('50000000000000000'), { from: lp1 })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // SPENDER should be able to spend allowance
        it('SPENDER should be able to spend allowance', async () => {
            await adonisDEX.transferFrom(lp1, swaper2, toTokens('100'), { from: spender });
            allowance = await adonisDEX.allowance(lp1, spender);
            assert.equal(allowance.toString(), toTokens('100'));
        })

        // SPENDER should not be able to spend more than allowance
        it('SPENDER should not be able to spend more than allowance', async () => {
            errMsg = 'SPENDER should not be able to spend more than allowance';
            await adonisDEX.transferFrom(lp1, swaper2, toTokens('100000'), { from: spender })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })
})