// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "./../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./../node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "./../node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "./../node_modules/@openzeppelin/contracts/access/Ownable.sol";
import "./../node_modules/@openzeppelin/contracts/access/AccessControl.sol";
import "./../node_modules/@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract OurDEXToken is
            Initializable,
            ERC20,
            ERC20Snapshot,
            ERC20Pausable,
            Ownable,
            AccessControl
{
    constructor(string memory name_, string memory symbol_, address _governance) ERC20(name_, symbol_) Ownable(){
        _setupRole(DEFAULT_ADMIN_ROLE, _governance);
        transferOwnership(_governance);
    }

    function snapshot() public onlyOwner(){
        _snapshot();
    }

    function pause() public onlyOwner(){
        _pause();
    }

    function unpause() public onlyOwner(){
        _unpause();
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        whenNotPaused
        override(ERC20, ERC20Snapshot, ERC20Pausable)
    {
        super._beforeTokenTransfer(from, to, amount);
    }
}