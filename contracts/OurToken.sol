// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract OurToken is ERC20 {
  constructor() ERC20("OurToken", "OURT") {
    _mint(msg.sender, 1000 * 10 ** decimals());
  }
}
