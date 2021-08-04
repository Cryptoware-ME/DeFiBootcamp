// Chai lib for assertion and promise-based tests
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

// chai assert
const { assert } = chai;

// chai promises
chai.use(chaiAsPromised);

// importing utils
const { 
    toTokens, 
    fromTokens, 
    encodePermitAbiData, 
    getCurrentTime,
    getAccPrivate,
    toBn
} = require('./utils/test-utils');

// load contract artifact
const OurTokenContract = artifacts.require('OurToken');

// OurToken contract test spec
contract('OurToken', ([admin, minter, pauser, snapshoter, holder, nonholder, smallholder, spender, issuer, beneficiary]) => {
    let chainId;
    let ourToken;
    let now;

    let checques = {};

    let _init_checques = () => ({
        spender: beneficiary, 
        owners: [],
        values: [],
        deadlines:  [],
        vs: [],
        rs: [],
        ss: []
    });

    // init contract instance for test session
    before(async () => {
        chainId = await web3.eth.getChainId();
        ourToken = await OurTokenContract.deployed();

        // mint coins for checques issuer
        await ourToken.mint(issuer, toTokens('600000000'), { from: admin });

        // getting block timestamp and adding 10 seconds
        now = await getCurrentTime(500);

        // setup checques mock database
        checques = _init_checques();
    })

    // AlefToken has to have specific properties (totalSupply, setup roles) that should be verified on deployment
    describe('AlefToken Deployment', async () => {

        // Check name and symbol
        
        it('Name is AlefToken and symbol is ALEF', async () => {
            let name = await alefToken.name();
            let symbol = await alefToken.symbol();
            assert.equal(name, 'AlefToken');
            assert.equal(symbol, 'ALEF');
        })

        // Check Initial supply, should be 1,500,000,000
        it('Has inital supply of 2,100,000,000', async () => {
            totalSupply = await alefToken.totalSupply();
            assert.equal(totalSupply.toString(), toTokens('2100000000'));
        })

        // Check decimals is accessible
        it('Decimals set to 18', async () => {
            decimals = await alefToken.decimals();
            assert.equal(decimals.toString(), 18)
        })
    })

    // AlefToken has to be mintable only when the minting address has role permission
    describe('AlefToken Minting', async () => {

        // ADMIN role should be able to assign MINTER address
        it('ADMIN can assign MINTER role', async () => {
            await alefToken.grantMinter(minter, { from: admin })
            isMinter = await alefToken.isMinter(minter);
            assert.ok(isMinter);
        })

        // ADMIN role should be able to MINT 
        it('ADMIN should be able to mint', async () => {
            await alefToken.mint(holder, toTokens('500000000'), { from: admin });
            let supply = await alefToken.totalSupply();
            assert.equal(supply.toString(), toTokens('2600000000'));
        })

        // NO ROLE should not be able to MINT 
        it('NO ROLE should not be able to mint', async () => {
            errMsg = 'Account with no role was able to mint';
            await alefToken.mint(holder, toTokens('500000000'), { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error))
        })

        // MINTER role should be able to mint new tokens
        it('MINTER should be able to mint', async () => {
            await alefToken.mint(holder, toTokens('500000000'), { from: minter });
            let supply = await alefToken.totalSupply();
            assert.equal(supply.toString(), toTokens('3100000000'));
        })
    })

    // AlefToken has to be transferable between accounts
    describe('AlefToken Transfers', async () => { 

        // NON-HOLDER should not be able to transfer any tokens
        it('NON-HOLDER can`t transfer tokens', async () => {
            errMsg = 'Account with no tokens was able to transfer tokens';
            await alefToken.transfer(holder, toTokens('500000'), { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // HOLDER should successfully transfer their tokens
        it('HOLDER should successfully transfer their tokens', async () => {
            await alefToken.transfer(smallholder, toTokens('100'), { from: holder });
            let balance = await alefToken.balanceOf(smallholder);
            assert.equal(balance, toTokens('100'));
        })

        // holder should not be able to transfer more tokens than they have
        it('HOLDER should`t transfer more than they have', async () => {
            errMsg = 'Account with no tokens was able to transfer tokens';
            await alefToken.transfer(nonholder, toTokens('200'), { from: smallholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })

    // AlefToken has to be burnable by token holder
    describe('AlefToken Burning', async () => {

        // NON-HOLDER can`t burn tokens
        it('NON-HOLDER can`t burn tokens', async () => {
            errMsg = 'Account without any tokens was able to burn tokens';
            await alefToken.burn(toTokens('200'), { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // holder should not be able to burn more tokens than they hold
        it('HOLDER should`t burn more than they have', async () => {
            errMsg = 'Account was able to burn more tokens than they have';
            await alefToken.burn(toTokens('200'), { from: smallholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // HOLDER should successfully burn their tokens
        it('HOLDER should successfully burn their tokens', async () => {
            await alefToken.burn(toTokens('50'), { from: smallholder })
                .then(async () => {
                    let balance = await alefToken.balanceOf(smallholder);
                    assert.equal(balance.toString(), toTokens('50'));
                })
                .catch((error) => assert.fail(error));
        })
    })

    // AlefToken has to be PAUSABLE only by address that has role permissions
    describe('AlefToken Pausing', async () => {

        // ADMIN should be able to assign role
        it('ADMIN should be able to assign role', async () => {
            await alefToken.grantPauser(pauser, { from: admin })
            isPauser = await alefToken.isPauser(pauser);
            assert.ok(isPauser);
        })

        // NO ROLE should not be able to pause the contract
        it('NO ROLE should not be able to pause the contract', async () => {
            errMsg = 'Account without PAUSER role was able to pause contract';
            await alefToken.pause({ from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // ADMIN should be able to pause the contract
        it('ADMIN should be able to pause the contract', async () => {
            await alefToken.pause({ from: admin })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // ADMIN should be able to unpause the contract
        it('ADMIN should be able to unpause the contract', async () => {
            await alefToken.unpause({ from: admin })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // PAUSABLE role should be able to pause the contract
        it('PAUSABLE role should be able to pause the contract', async () => {
            await alefToken.pause({ from: pauser })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // NO ROLE should not be able to unpause the contract
        it('NO ROLE should not be able to unpause the contract', async () => {
            errMsg = 'Account without PAUSER role was able to unpause contract';
            await alefToken.unpause({ from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // PAUSABLE role should be able to unpause the contract
        it('PAUSABLE role should be able to unpause the contract', async () => {
            await alefToken.unpause({ from: pauser })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })
    })

    // AlefToken has to be snapshotable if caller has role permission
    describe('AlefToken Snapshots', async () => {

        // ADMIN should be able to assign role
        it('ADMIN should be able to assign role', async () => {
            await alefToken.grantSnapshot(snapshoter, { from: admin });
            isSnap = await alefToken.isSnapshoter(snapshoter);
            assert.ok(isSnap);
        })

        // ADMIN should be able to snapshot the contract
        it('ADMIN should be able to snapshot the contract', async () => {
            await alefToken.snapshot({ from: admin })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // NO ROLE should not be able to snapshot the contract
        it('NO ROLE should not be able to snapshot the contract', async () => {
            errMsg = 'Account without SNAPSHOT role was able to snapshot contract';
            await alefToken.snapshot({ from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // SNAPSHOT role should be able to snapshot the contract
        it('SNAPSHOT role should be able to snapshot the contract', async () => {
            await alefToken.snapshot({ from: snapshoter })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })
    })

    // AlefToken Access Control extra checks
    describe('AlefToken Access Control', async () => {

        // NO ADMIN should not be able to unassign roles
        it('NO ADMIN should not be able to unassign roles', async () => {
            errMsg = 'Account without ADMIN role was able to unassign roles';
            await alefToken.revokeMinter(minter, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));

            await alefToken.revokePauser(pauser, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));

            await alefToken.revokeSnapshot(snapshoter, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // ADMIN should be able to un-assign roles
        it('ADMIN should be able to un-assign roles', async () => {
            await alefToken.revokeMinter(minter, { from: admin });
            await alefToken.revokePauser(pauser, { from: admin });
            await alefToken.revokeSnapshot(snapshoter, { from: admin });
            isMinter = await alefToken.isMinter(minter);
            isPauser = await alefToken.isPauser(snapshoter);
            isSnap = await alefToken.isSnapshoter(snapshoter);
            assert.ok(!isMinter && !isSnap && !isPauser);
        })

        // NO ADMIN should not be able to assign roles
        it('NO ADMIN should not be able to assign roles', async () => {
            errMsg = 'Account without ADMIN role was able to assign roles';
            await alefToken.grantMinter(minter, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));

            await alefToken.grantPauser(pauser, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));

            await alefToken.grantSnapshot(snapshoter, { from: nonholder })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })

    // AlefToken Allowance & Approvals
    describe('AlefToken Allowances & Spending', async () => {

        // Account should be able to set SPENDER and ALLOWANCE
        it('Account should be able to set SPENDER and ALLOWANCE', async () => {
            await alefToken.approve(spender, toTokens('200'), { from: holder });
            allowance = await alefToken.allowance(holder, spender);
            assert.equal(allowance.toString(), toTokens('200'));

            await alefToken.approve(spender, toTokens('200'), { from: smallholder });
            allowance = await alefToken.allowance(smallholder, spender);
            assert.equal(allowance.toString(), toTokens('200'));
        })

        // Account should be able to increase/decrease allowance for spender
        it('Account should be able to set increase allowance for spender', async () => {
            await alefToken.increaseAllowance(spender, toTokens('50'), { from: holder });
            allowance = await alefToken.allowance(holder, spender);
            assert.equal(allowance.toString(), toTokens('250'));

            await alefToken.decreaseAllowance(spender, toTokens('50'), { from: holder });
            allowance = await alefToken.allowance(holder, spender);
            assert.equal(allowance.toString(), toTokens('200'));
        })

        // Account should be able to increase/decrease allowance for spender outside holder balance 
        it('Account should be able to increase/decrease allowance for spender outside holder balance', async () => {
            await alefToken.increaseAllowance(spender, toTokens('50000000000000000'), { from: holder })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));

            await alefToken.decreaseAllowance(spender, toTokens('50000000000000000'), { from: holder })
                .then(() => assert.ok(1))
                .catch((error) => assert.fail(error));
        })

        // SPENDER should be able to spend allowance
        it('SPENDER should be able to spend allowance', async () => {
            await alefToken.transferFrom(holder, smallholder, toTokens('100'), { from: spender });
            allowance = await alefToken.allowance(holder, spender);
            assert.equal(allowance.toString(), toTokens('100'));
        })

        // SPENDER should not be able to spend more than allowance
        it('SPENDER should not be able to spend more than allowance', async () => {
            errMsg = 'SPENDER should not be able to spend more than allowance';
            await alefToken.transferFrom(holder, smallholder, toTokens('100000'), { from: spender })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })

        // SPENDER should not be able to spend more than holder balance
        it('SPENDER should not be able to spend more than holder balance', async () => {
            errMsg = 'SPENDER should not be able to spend more than holder balance';
            await alefToken.transferFrom(smallholder, holder, toTokens('100000000'), { from: spender })
                .then(() => assert.fail(errMsg))
                .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    })    

    // AlefToken Checques 
    describe('AlefToken Checques', async () => { 

        // Issuer account should be able to sign a EIP-712 permit as checque
        it('Issuer account should be able to sign a EIP-712 permit as checque', async () => {
            let deadline = now+3000;
            let value = '250000000';

            // encode data 
            let checque = encodePermitAbiData(
                issuer, 
                beneficiary, 
                value, 
                await alefToken.nonces(issuer, beneficiary), 
                deadline, 
                await alefToken.name(), 
                await alefToken.version(), 
                1, 
                alefToken.address
            );

            // sign checque data
            const msg = web3.eth.accounts.sign(checque, getAccPrivate(issuer));
            const adr = web3.eth.accounts.recover(msg, msg.signature);

            // storing checques for later usage
            checques.owners.push(issuer);
            checques.values.push(toTokens(value));
            checques.deadlines.push(deadline);
            checques.vs.push(msg.v);
            checques.rs.push(msg.r);
            checques.ss.push(msg.s);

            assert.ok(issuer === adr);
        })

        // Beneficiary account should be able to cash in the checque
        it('Beneficiary account should be able to cash in the checque', async () => {
            await alefToken.cashChecques(
                beneficiary, 
                checques.owners, 
                checques.values, 
                checques.deadlines, 
                checques.vs, 
                checques.rs, 
                checques.ss, 
                { from: beneficiary }
            );
            let benBal = await alefToken.balanceOf(beneficiary);
            assert.equal(fromTokens(benBal), 248750000);
        })

        // Issuer account should be able to sign multiple EIP-712 permits as checques
        it('Issuer account should be able to sign multiple EIP-712 permits as checques', async () => {
            let deadline = now+3000;
            let nonce = await alefToken.nonces(issuer, beneficiary);
            let value = '50000000';

            // encode data for first checque
            let checque1 = encodePermitAbiData(
                issuer, 
                beneficiary, 
                value, 
                nonce, 
                deadline, 
                await alefToken.name(), 
                await alefToken.version(), 
                1, 
                alefToken.address
            );

            // sign first checque data
            const msg1 = web3.eth.accounts.sign(checque1, getAccPrivate(issuer));
            const adr1 = web3.eth.accounts.recover(msg1, msg1.signature);

            // increase nonce by 1
            let newNonce = nonce.add(toBn(1));

            // encode data for first checque
            let checque2 = encodePermitAbiData(
                issuer, 
                beneficiary, 
                value, 
                newNonce, 
                deadline, 
                await alefToken.name(), 
                await alefToken.version(), 
                1, 
                alefToken.address
            );

            // sign first checque data
            const msg2 = web3.eth.accounts.sign(checque2, getAccPrivate(issuer));
            const adr2 = web3.eth.accounts.recover(msg2, msg2.signature);

            // storing checques for later usage
            checques = _init_checques();
            checques.owners.push(issuer);
            checques.owners.push(issuer);
            checques.values.push(toTokens(value));
            checques.values.push(toTokens(value));
            checques.deadlines.push(deadline);
            checques.deadlines.push(deadline);
            checques.vs.push(msg1.v);
            checques.vs.push(msg2.v);
            checques.rs.push(msg1.r);
            checques.rs.push(msg2.r);
            checques.ss.push(msg1.s);
            checques.ss.push(msg2.s);

            assert.ok(adr2 === issuer && adr1 === issuer);
        })

        // Beneficiary account should be able to batch cash in multiple checques
        it('Beneficiary account should be able to batch cash in multiple checques', async () => {
            await alefToken.cashChecques(
                beneficiary, 
                checques.owners, 
                checques.values, 
                checques.deadlines, 
                checques.vs, 
                checques.rs, 
                checques.ss, 
                { from: beneficiary }
            );
            let benBal = await alefToken.balanceOf(beneficiary);
            assert.equal(fromTokens(benBal), 348250000);
        })

        // Non-beneficiary account should not be able to cash in checque
        it('Non-beneficiary account should not be able to cash in checque', async () => {
            let deadline = now+3000;
            let value = '10000000';

            // encode data 
            let checque = encodePermitAbiData(
                issuer, 
                beneficiary, 
                value, 
                await alefToken.nonces(issuer, beneficiary), 
                deadline, 
                await alefToken.name(), 
                await alefToken.version(), 
                1, 
                alefToken.address
            );

            // sign checque data
            const msg = web3.eth.accounts.sign(checque, getAccPrivate(issuer));

            // storing checques for later usage
            checques = _init_checques();
            checques.owners.push(issuer);
            checques.values.push(toTokens(value));
            checques.deadlines.push(deadline);
            checques.vs.push(msg.v);
            checques.rs.push(msg.r);
            checques.ss.push(msg.s);

            errMsg = 'Account not marked as beneficiary was able to withdraw funds';
            await alefToken.cashChecques(
                beneficiary, 
                checques.owners, 
                checques.values, 
                checques.deadlines, 
                checques.vs, 
                checques.rs, 
                checques.ss, 
                { from: nonholder }
            )
            .then(() => assert.fail(errMsg))
            .catch((error) => error.message === errMsg ? assert.fail(errMsg) : assert.isNotNull(error));
        })
    });
})