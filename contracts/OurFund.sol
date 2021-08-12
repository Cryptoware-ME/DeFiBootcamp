// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "./../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol";
import './OurFundToken.sol';

contract OurFund is OurFundToken 
{
    /** DEFINITIONS */

    // Math-specific libraries for safely handling larger numbers
    using SafeMath  for uint;

    // struct to store trade history data
    struct trade{
        uint spentToken; 
        uint boughtETH;
    }

    /** CONSTANTS */

    /** PUBLIC RECORD */

    // Bot role code
    bytes32 public BOT_ROLE = keccak256("BOT_ROLE");

    string public BOT_PARAMS;

    // a mapping of timestamp to trade for trade history retention
    mapping (uint32 => trade) public tradeHistory;

    /** PRIVATE */
    
    // The address of the ERC20 token that this fund is holding in reserves
    address private token;
    
    // dex to trade on
    address private dex;

    // a mapping of addresses to amount of elligible tokens for ETH redemption
    mapping (address => uint) private elligbleTokens;

    /**
     * @notice We usually require to know who are all the stakeholders.
     */
    address[] internal stakeholders;

    // Contract state variables
    uint private totalElligbleTokens;
    uint private reserveToken;       
    uint private reserveETH;
    uint32 private blockTimestampLast;   

    /** MODIFIERS */
    
    // Locking mechanism modifier for specific lock-requiring actions
    uint8 private unlocked;
    modifier lock() {
        require(unlocked == 1, 'OurFund: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }    
    
    // Deadline insurance modifier: Stops execution if dealine timestamp reached
    modifier ensure(uint32 deadline) {
        require(deadline >= block.timestamp, 'OurFund: EXPIRED');
        _;
    }

    /** EVENT DEFINITIONS */
    
    // Definition of events that are emitted by the contract
    event Mint(address indexed sender, uint mintedADNS); // Emitted on minting of ADNS
    event Burn(address indexed sender, uint redeemedETH, uint redeemedToken, uint burnedADNS); // Emitted on burning of ADNS
    event Sync(string reservesUpdated, uint balance); // Emitted when the contract matches the balances and the reserves
    event RegisteredTrade(uint spentToken, uint boughtETH ); // Emitted when the BOT Registers an executed trade

    /** INIT */

    constructor(address _dex, address _token, address _bot, address _governance) OurFundToken('OurFund', 'OURF', _governance) {
        token = _token;
        BOT_PARAMS = "";
        totalElligbleTokens = 0;
        reserveToken = 0;       
        reserveETH = 0;
        unlocked = 1;
        dex = _dex;
        _setupRole(BOT_ROLE, _bot);
    }
    
    /** PAYABLE */

    /** Payable fallback function has nothing inside so it won't run out of gas with gas limited transfers */
    receive() external payable { 
        // revert();
    }

    /** PUBLIC VIEWS */

    /**
    * @notice A method to check if an address is a stakeholder.
    * @param _address The address to verify.
    * @return bool, uint256 Whether the address is a stakeholder,
    * and if so its position in the stakeholders array.
    */
    function isStakeholder(address _address) public view returns (bool, uint)
    {
        for (uint s = 0; s < stakeholders.length; s += 1) {
            if (_address == stakeholders[s]) return (true, s);
        }
        return (false, 0);
    }

    function isAllowedBot(address _bot) public view returns (bool){
        return hasRole(BOT_ROLE, _bot);
    }

    function getReserves() public view returns (uint, uint, uint32) {
        return (reserveETH, reserveToken, blockTimestampLast);
    }

    function totalElligebleSupply() public view returns(uint){
        return totalElligbleTokens;
    }

    function accountElligebleToken(address account) public view returns(uint){
        return elligbleTokens[account];
    }


    /** PUBLIC ACTIONS */
    
    /** Governance */
    function changeGovernance(address governance) public onlyOwner(){
        require(_msgSender() != governance, 'OurFund: SAME_GOVERNANCE_ADDRESS');
        transferOwnership(governance);
    }

    function grantBotRole(address _nextbot) public onlyOwner(){
        grantRole(BOT_ROLE, _nextbot);
    }

    function revokeBot(address _bot) public onlyOwner(){
        revokeRole(BOT_ROLE, _bot);
    }

    function assignBotParameters(string memory _bot_params) public onlyOwner(){
        BOT_PARAMS = _bot_params;
    }

    /** /Governance */

    // Stakers can send their OURT tokens to AdonisArbitrage and receive the ADNS tokens in return.
    function addToFund(uint amount, uint32 deadline) public ensure(deadline) {
        
        // Assign addresses
        address from = _msgSender();

        // from cannot be address(0)
        require(from != address(0), 'OurFund: ZERO_ADDRESS_MINTING');
        
        // Check the amount sent is greater than 0
        require(amount > 0 , 'OurFund: INSUFFICIENT_ADNS_MINTED');

        // Calling Transfer From Token Function
        _safeTransferFromToken(from, address(this), amount);

        // Add StakeHolder In Case Doesn't Exsist's
        _addStakeholder(from);

        // Mint 1:1 ADNS tokens
        __mint(from, amount);
    }

    // Stakers can WithDraw their OURT tokens by burning non-elligible ADNS.
    function withdrawFromFund(uint amountBurned, uint32 deadline) public ensure(deadline){
        // Check that the amount requested to burn is > 0
        require(amountBurned > 0, 'OurFund: INSUFFICIENT_AMOUNT_BURNED');

        address to = _msgSender();
        require(to != address(0), 'OurFund: ZERO_ADDRESS_WITHDRAWAL');

        // get non-elligible tokens for account
        uint nonelig = balanceOf(to).sub(elligbleTokens[to]);

        // check non-elligible tokens >= amount burned
        require(nonelig >= amountBurned, 'OurFund: ELLIGBLE_TOKEN_BURN_ON_NONELIG');

        // Calling Transfer From Token Function to transfer token to user
        _safeTransferToken(to, amountBurned);

        // after successful transfer, burn ADNS tokens.
        __burn(to, amountBurned, 0, amountBurned);
    }

    // Stakers can WithDraw their ADNS tokens to ETH (taking into consideration the elligble amount (Allowed Amount) ).
    function withdrawETH(uint amountBurned) public{

        // Assign addresses
        address to = _msgSender();
        address from = address(this);

        // getting account elligble token
        uint eligToken = elligbleTokens[to];

        // Checking if amountBurned <= elligbleTokens
        require(amountBurned <= eligToken, 'OurFund: NON_ELLIGBLE_TOKENS');

        // Get Eth Reserve
        uint ethReserve = from.balance;

        // Get Eth To Send
        uint ethToSend = ethReserve.mul(amountBurned / totalElligbleTokens);

        // Checking if ethToSend <= ethReserve
        require(ethToSend <= ethReserve, 'OurFund: Tokens were not transfered successfully');

        _safeTransferETH(payable(to), ethToSend);

        // Burn ADNS
        __burn(to, amountBurned, ethToSend, 0);
    }

    // approves funds for bot usage
    function approveBotFunds(uint amount) public onlyRole(BOT_ROLE){
        IERC20(token).approve(_msgSender(), amount);
    }

    // Bot Will Register Trade After Executing Trade Function
    function registerTrade(uint _spentToken, uint _boughtETH) public onlyRole(BOT_ROLE) {
        // get reserves
        (uint _reserveETH, uint _reserveToken, ) = getReserves();

        // get balances
        uint balanceETH = address(this).balance;
        uint balanceToken = IERC20(token).balanceOf(address(this));

        // get amounts
        uint amountETHIn = balanceETH.sub(_reserveETH);
        uint amountTokenOut = _reserveToken.sub(balanceToken);

        // check for amount validity
        require(amountETHIn == _boughtETH, "OurFund: ETH_AMOUNT_MISMATCH");
        require(amountTokenOut == _spentToken, "OurFund: TOKEN_AMOUNT_MISMATCH");

        // Add Information To Trade History
        tradeHistory[blockTimestampLast] = trade(_spentToken , _boughtETH);

        // Calculate and assign Elligble Tokens
        _assignElligbleTokens(_spentToken);

        emit RegisteredTrade(_spentToken, _boughtETH);
    }

    /** PRIVATE FUNCTIONS */

    /**
    * @notice A method to add a stakeholder.
    * @param _stakeholder The stakeholder to add.
    */
    function _addStakeholder(address _stakeholder) private {
        (bool _isStakeholder, ) = isStakeholder(_stakeholder);
        if(!_isStakeholder) stakeholders.push(_stakeholder);
    }

    /**
    * @notice A method to remove a stakeholder.
    * @param _stakeholder The stakeholder to remove.
    */
    function _removeStakeholder(address _stakeholder) private {
        (bool _isStakeholder, uint s) = isStakeholder(_stakeholder);
        require(_isStakeholder, "OurFund: ACCOUNT_NOT_STAKEHOLDER");
        stakeholders[s] = stakeholders[stakeholders.length - 1];
        stakeholders.pop();
    }

    // Calculate Elligle Token Will be A Private Function That Will be triggered After Trades
    function _assignElligbleTokens(uint spentToken) private {
        // Checking If spentToken is 0
        require(spentToken > 0 , 'OurFund: SPENT_TOKENS_ZERO');

        // Get Total ADNS
        uint totalNonElligbleADNS = totalSupply().sub(totalElligbleTokens);

        // Checking If StackHolders exists
        require(stakeholders.length > 0, 'OurFund: No StakeHolders Found!');

        for (uint s = 0; s < stakeholders.length ; s+=1) {
            // Calculate Elligble 
            if(elligbleTokens[stakeholders[s]] > 0){
                elligbleTokens[stakeholders[s]] += spentToken.mul( balanceOf(stakeholders[s]).sub(elligbleTokens[stakeholders[s]]) / totalNonElligbleADNS);
            } else {
                elligbleTokens[stakeholders[s]] = spentToken.mul( balanceOf(stakeholders[s]) / totalNonElligbleADNS);
            }
        }

        totalElligbleTokens += spentToken;
    }

    // Update Elligble Token for burning account
    function _updateAccountElligbleTokens(address from , uint burnedAmount) private {
        // check valid stakeholder
        (bool _isStakeholder, ) = isStakeholder(from);
        require(_isStakeholder, 'OurFund: STAKEHOLDER_NOT_VALID');

        // Check If There Is Elligblity To Burn Tokens
        require(elligbleTokens[from] >= burnedAmount, 'OurFund: ELLIGBLE_TOKEN_BURN_ON_NONELIG');

        // update state values
        elligbleTokens[from] -= burnedAmount;
        totalElligbleTokens -= burnedAmount;
    }

    // transfers OURT token from ADNS to supplied address
    function _safeTransferToken(address to, uint value) private {
        bool success = IERC20(token).transfer(to, value);
        require(success, 'OurFund: OURT_TRANSFER_FAILED');
    }    
    
    // when using to send ETH to another CONTRACT and not a wallet, 
    // one should make sure that receiving contract(ie: arbitrage) has payable function
    function _safeTransferETH(address payable to, uint value) private {
        to.transfer(value);
    }    

    // transfers OURT token from supplied address to supplied address
    function _safeTransferFromToken(address from, address to, uint value) private {
        bool success = IERC20(token).transferFrom(from, to, value);
        require(success, 'OurFund: OURT_TRANSFER_FAILED');
    }

    function __mint(address from , uint amount) internal lock{
        (, uint _reserveToken, ) = getReserves();
        uint balanceToken = IERC20(token).balanceOf(address(this)); 
        uint amountToken = balanceToken.sub(_reserveToken); 

        require(amountToken > 0 ,'OurFund: INSUFFICIENT_OURT_SENT');
        require(amount > 0 ,'OurFund: INSUFFICIENT_ADNS_MINTED');
        require(amount == amountToken ,'OurFund: INSUFFICIENT_ADNS_MINTED');
        require(from != address(0), 'OurFund: ZERO_ADDRESS_MINTING');

        // Mint requested tokens
        _mint(from, amount);

        // Update reserves with new balances
        _updateTokenReserves(balanceToken);

        emit Mint(from, amount);
    }

    function __burn(address from , uint amount, uint amountTokenOut, uint amountETHOut) internal lock{
        (uint _reserveETH, uint _reserveToken, ) = getReserves();
        uint _totalSupply = totalSupply();
        require(amount <= _totalSupply, 'OurFund: INSUFFICIENT_SUPPLY_BURN');

        // call burn on 'to' address for requested burn amount
        _burn(from, amount);

        if(amountETHOut > 0){
            uint balanceETH = address(this).balance;
            require(_reserveETH.add(amountETHOut) == balanceETH, 'OurFund: INSUFFICIENT_AMOUNT_OUT');
            _updateETHReserves(balanceETH);
            _updateAccountElligbleTokens(from, amount);
        }

        if(amountTokenOut > 0){
            uint balanceToken = IERC20(token).balanceOf(address(this));
            require(_reserveToken.add(amountTokenOut) == balanceToken, 'OurFund: INSUFFICIENT_AMOUNT_OUT');
            _updateTokenReserves(balanceToken);
        }

        emit Burn(from, amountETHOut, amountTokenOut, amount);
    }

    // update reserves and, on the first call per block, pushes to price history
    function _updateTokenReserves(uint balance) private {
        require(balance <= type(uint).max, 'OurFund: OVERFLOW'); // check for potential UINT overflow
        uint32 blockTimestamp = uint32(block.timestamp % 2**32); // getting current block timestamp and casting to proper format
        reserveToken = uint(balance); // update OURT reserves
        blockTimestampLast = blockTimestamp;
        emit Sync('TOKEN', reserveToken);
    }

    // update reserves and, on the first call per block, pushes to price history
    function _updateETHReserves(uint balance) private {
        require(balance <= type(uint).max, 'OurFund: OVERFLOW'); // check for potential UINT overflow
        uint32 blockTimestamp = uint32(block.timestamp % 2**32); // getting current block timestamp and casting to proper format
        reserveETH = uint(balance); // update ETH reserves
        blockTimestampLast = blockTimestamp;
        emit Sync('ETH', reserveETH);
    }
}