const OurToken = artifacts.require("OurToken");
const OurDEX = artifacts.require("OurDEX");
const OurFund = artifacts.require("OurFund");

module.exports = function (deployer, _, accounts) {
  const token = await deployer.deploy(OurToken);
  const dex = await deployer.deploy(OurDEX, token, 3);
  await deployer.deploy(OurFund, dex, token, accounts[0], accounts[1]);
};
