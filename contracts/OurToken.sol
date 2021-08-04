// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice access control base classes
import "./../node_modules/@openzeppelin/contracts/access/AccessControl.sol";
import "./../node_modules/@openzeppelin/contracts/access/Ownable.sol";

/// @notice ERC20 features base classes
import "./../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./../node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./../node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import "./../node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "./../node_modules/@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/// @notice SafeMath library for uint calculations with overflow protections
import "./../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol";

contract OurToken is
            ERC20,
            ERC20Burnable,
            ERC20Snapshot,
            ERC20Pausable,
            AccessControl,
            Ownable,
            ERC20Permit
{
  /// @notice using safe math for uints
  using SafeMath for uint;

  /// @notice contract version
  string private _version;

  /// @notice constant hashed roles for access control
  bytes32 public constant SNAPSHOT_ROLE = keccak256("SNAPSHOT_ROLE");
  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  /// @notice the fees as per-thousand from checques transactions
  uint private checquesFeesPerThousand;

  /**
    * @notice constructor
  **/
  constructor() ERC20("OurToken", "OURT") ERC20Permit("OurToken") Ownable() {
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(SNAPSHOT_ROLE, _msgSender());
    _setupRole(PAUSER_ROLE, _msgSender());
    _setupRole(MINTER_ROLE, _msgSender());
    _mint(_msgSender(), 1000 * 10 ** decimals());
    checquesFeesPerThousand = 5;
    _version = "1";
  }

  /// @notice gets the contract version
  function version() public view returns (string memory) {
    return _version;
  }

  /**
    * @notice gets the checques fee rate per-thousand
    * @return uint checques fee-rate per-thousand
  **/
  function getChecquesFees() external view returns (uint){
    return checquesFeesPerThousand;
  }

  /**
    * @notice changes the fees collected on checques transfers
    * @param newFees the fee-rate per-thousand
  **/
  function changeChecquesFees(uint newFees) external onlyOwner(){
    checquesFeesPerThousand = newFees;
  }

  /**
    * @notice grants the minter role to the specified address
    * @param minter address
  **/
  function grantMinter(address minter) public onlyRole(DEFAULT_ADMIN_ROLE) {
    grantRole(MINTER_ROLE, minter);
  }

  /**
    * @notice checks if address has the minter role
    * @param minter address
  **/
  function isMinter(address minter) public view onlyRole(DEFAULT_ADMIN_ROLE) returns (bool){
    return hasRole(MINTER_ROLE, minter);
  }

  /**
    * @notice revokes the minter role for the specified address
    * @param minter address
  **/
  function revokeMinter(address minter) public onlyRole(DEFAULT_ADMIN_ROLE) {
    revokeRole(MINTER_ROLE, minter);
  }

  /**
    * @notice mints specific amount of tokens for specified address
    * @param to address
    * @param amount the amount of tokens to mint
  **/
  function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
    _mint(to, amount);
  }

  /**
    * @notice grants the pauser role to a specified address
    * @param pauser address
  **/
  function grantPauser(address pauser) public onlyRole(DEFAULT_ADMIN_ROLE) {
    grantRole(PAUSER_ROLE, pauser);
  }

  /**
    * @notice checks if address has the pauser role
    * @param pauser address
  **/
  function isPauser(address pauser) public view onlyRole(DEFAULT_ADMIN_ROLE) returns (bool){
    return hasRole(PAUSER_ROLE, pauser);
  }

  /**
    * @notice revokes the pauser role for the specified address
    * @param pauser address
  **/
  function revokePauser(address pauser) public onlyRole(DEFAULT_ADMIN_ROLE) {
    revokeRole(PAUSER_ROLE, pauser);
  }

  /// @notice pauses the token contract
  function pause() public onlyRole(PAUSER_ROLE) {
    _pause();
  }

  /// @notice unpauses the token contract
  function unpause() public onlyRole(PAUSER_ROLE) {
    _unpause();
  }

  /**
    * @notice grants the snapshot role to a specified address
    * @param _snapshot address
  **/
  function grantSnapshot(address _snapshot) public onlyRole(DEFAULT_ADMIN_ROLE) {
    grantRole(SNAPSHOT_ROLE, _snapshot);
  }

  /**
    * @notice checks if address has the snapshot role
    * @param _snapshot address
  **/
  function isSnapshoter(address _snapshot) public view onlyRole(DEFAULT_ADMIN_ROLE) returns (bool){
    return hasRole(SNAPSHOT_ROLE, _snapshot);
  }

  /**
  * @notice revokes the snapshot role for the specified address
  * @param _snapshot address
  **/
  function revokeSnapshot(address _snapshot) public onlyRole(DEFAULT_ADMIN_ROLE) {
    revokeRole(SNAPSHOT_ROLE, _snapshot);
  }

  /// @notice takes a snapshot of the token contract
  function snapshot() public onlyRole(SNAPSHOT_ROLE) {
    _snapshot();
  }

  /**
    * @notice cashes a list of checques as signed permits for the beneficiary
    * @param spender address of beneficiary
    * @param owners address list of checques signatories
    * @param values the values transfered through the checques
    * @param deadlines the deadline for cashing in the checques
    * @param vs signatures
    * @param rs signatures
    * @param ss signatures
  */
  function cashChecques(
    address spender,
    address[] memory owners,
    uint256[] memory values,
    uint256[] memory deadlines,
    uint8[] memory vs,
    bytes32[] memory rs,
    bytes32[] memory ss
  ) external {
    /// @notice information arity match check
    require(
      owners.length == values.length /* solium-disable-line */
      && owners.length == deadlines.length
      && owners.length == vs.length
      && owners.length == rs.length
      && owners.length == ss.length,
    "OurToken:cashChecques:: INFORMATION_ARITY_MISMATCH");

    /// @notice loop through permit-checques list and cash them
    for (uint i = 0;i < owners.length;i++){
        cashChecque(owners[i], spender, values[i], deadlines[i], vs[i], rs[i], ss[i]);
    }
  }

  /**
    * @notice cashes the checque as signed permit for the beneficiary
    * @param owner address of checque signatory
    * @param spender address of beneficiary
    * @param value the value transfered through the checque
    * @param deadline the deadline for cashing in the checque
    * @param v signature
    * @param r signature
    * @param s signature
  **/
  function cashChecque(
      address owner,
      address spender,
      uint256 value,
      uint256 deadline,
      uint8 v,
      bytes32 r,
      bytes32 s
  ) internal {
      /// @notice msg.sender should be same as spender address
      require(spender == _msgSender(), 'OurToken:cashChecque:: INVALID_SPENDER_ADDRESS');

      /// @notice calculate contract fee from checques amount
      uint fee = value.mul(checquesFeesPerThousand)/1000;

      /// @notice permit and transfer funds
      permit(owner, spender, value, deadline, v, r, s);
      transferFrom(owner, spender, value.sub(fee));

      /// @notice burn contract fee tokens
      _burn(owner, fee);
  }

  /**
    * @notice before transfer function hook
    * @param from address sending the tokens
    * @param to address receiving the tokens
    * @param amount amount of tokens being transfered
  **/
  function _beforeTokenTransfer(address from, address to, uint256 amount)
      internal
      whenNotPaused
      override(ERC20, ERC20Snapshot, ERC20Pausable)
  {
      /// @notice call to parent before transfer hook
      super._beforeTokenTransfer(from, to, amount);
  }
}
