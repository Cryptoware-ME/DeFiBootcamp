/** HELPER FUNCTIONS FOR TESTING SPEC */

/** ethers & BN js lib */
const ethers = require("ethers");
const BN = require("bn.js");

/** ether js utils */
const { keccak256, toUtf8Bytes, defaultAbiCoder, solidityPack } = ethers.utils;

/** private keys map from ganache-generated accounts file */
const  { private_keys } = require('../../devnetAccs.json');

/** converting tokens to wei and back for easier assertion/display of numbers */ 
const toTokens = n => web3.utils.toWei(n);
const fromTokens = n => web3.utils.fromWei(n);

/** encoding numbers as uint256 for hashing and signing EIP712 */
const uint256 = n => web3.eth.abi.encodeParameter('uint256', n);

/** get the current block timestamp to use as deadline
 * basically if a transaction was submitted in block A and by the time 
 * it got validated, block A was mined and the transaction values are no 
 * longer valid (ie: asset price), therefore the action must be resubmitted
 * based on new values. 
 * This way the user will not get returns that didn't match their expectations.
**/ 
const getCurrentTime = (offset) => {
    return new Promise(function(resolve) {
        web3.eth.getBlock("latest").then(function(block) {
            resolve(block.timestamp + offset)
        });
    })
}

/** converts JS number to BN */
const toBn = (value) => new BN(value);

/** 
 * this function checks the TX object logs to find the events 
 * that have been triggered by the contract
**/
const checkEventEmitted = (tx, eventName) => tx.logs.filter((l) => l.event === eventName)[0];

/**
 * encodes to sign EIP-712 compliant messages 
 */
const createAbiEncodedSeparator = (types, args) => {
    return keccak256(defaultAbiCoder.encode(types, args))
}

/**
 * EIP-712 domain separator
 */
const encodeDomainSeparator = (name, version, chainId, contractAddress) => {
    return createAbiEncodedSeparator(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
            keccak256(toUtf8Bytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
            keccak256(toUtf8Bytes(name)),
            keccak256(toUtf8Bytes(version)),
            chainId,
            contractAddress
        ]
    );
}

/**
 * EIP-712 permit for ERC20 
 */
const encodePermitAbiData = (owner, spender, value, nonce, deadline, name, version, chainId, contractAddress) => {
    let permit_typehash = keccak256(toUtf8Bytes("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"));
    return keccak256(solidityPack(
        ['bytes2', 'bytes32', 'bytes32'],
        [
            '0x1901',
            encodeDomainSeparator(name, version, chainId, contractAddress),
            createAbiEncodedSeparator(
                ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
                [permit_typehash, owner, spender, uint256(toTokens(value)), uint256(nonce), uint256(deadline)]
            )
        ]
    ));
}

/** gets the test account's private key to sign with */
const getAccPrivate = (address) => private_keys[address.toString().toLowerCase()].toString().toLowerCase();

module.exports = {
    toTokens,
    fromTokens,
    getCurrentTime,
    checkEventEmitted,
    encodePermitAbiData,
    uint256,
    getAccPrivate,
    toBn
}