const OurToken = artifacts.require("OurToken");

module.exports = function (deployer) {
  deployer.deploy(OurToken);
};
