// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "./../node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./../node_modules/@openzeppelin/contracts/utils/math/Math.sol";
import "./../node_modules/@openzeppelin/contracts/utils/math/SafeMath.sol";
import './OurDEXToken.sol';
import './lib/SafeSqrt.sol';

contract OurDEX is OurDEXToken {

    /** DEFINITIONS */

    // Math-specific libraries for safely handling larger numbers=
    using SafeMath  for uint;

    /** Struct representing liquidity history entry*/
    struct liquidityRec {
        uint stamp;
        bool isdeposit; // true == deposit, false == withdraw
        uint amountETH;
        uint amountOURT;
    }

    /** Struct representing swap reports to be published when SWAP event is emitted */
    struct swapReport {
        address currency;
        uint amount;
    }

    /** CONSTANTS */

    // It is not advisable to initiate variables here in upgradeable contract
    // the exception is however, constants given they are not changed to non-constants in the updated contract

    /** PUBLIC */

    /**
     * It seems most DEX are adding this requirement where there should always be a minimum liquidity in the pool
     * in this scenario is might be important specially since we don't want the pool to dry up however this also
     * means possible impermanent loss for liquidity providers.
     * A sacrifice to the gods of DEX...
     * During Localnet alpha-phase, this number should be adjusted.
     * but this also needs to be checked on swaps in a small pool as an arbitrage swap could
     * maybe break it? more testing needed.
     * MAXI liquidity var is also added to control the price of OURX in other pools
    */
    uint public MINIMUM_LIQUIDITY;
    uint public MAXIMUM_LIQUIDITY;

    /**
     * A record of price history where the sensitivity is non-linear (or rather, per-block instead of per-timeframe).
     * Might not be best for historical data but it will serve as a reference for arbitrage bots in the future.
    */
    mapping (uint32 => uint) public priceHistory;

    /** PRIVATE */

    // reserves & block timestamp to detect new blocks
    uint private reserveOURT;
    uint private reserveETH;
    uint32  private blockTimestampLast;

    // declare var for fee factor
    uint private feeFactor;

    /**
     * A record of liquidity provision history
    */
    mapping (address => liquidityRec[]) private liquidtyRecords;

    /**
     * Var to hold the OURT token contract injected in the constructor.
    */
    address private ourToken;

    /**
     * It seems in uniswap, when the fees are on, the fees are calculated by delta K therefore last K is
     * It might be benificial to save the account liquidity history or just saving the initial liquidity value
     * and recalculating the OURX tokens' value from the current pool to show the difference to the user
    */
    /** uint112 public kLast; */

    /** MODIFIERS */

    // Locking mechanism modifier for specific lock-requiring actions
    uint8 private unlocked;
    modifier lock() {
        require(unlocked == 1, 'OurDEX: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // Deadline insurance modifier: Stops execution if dealine timestamp reached
    modifier ensure(uint32 deadline) {
        require(deadline >= block.timestamp, 'OurDEX: EXPIRED'); /* solium-disable-line */
        _;
    }

    /** EVENT DEFINITIONS */

    // Definition of events that are emitted by the contract
    // Emitted on minting of OURX (aka liquidity deposit)
    event Mint(address indexed sender, uint amountETH, uint amountOURT, uint mintedOURX);
    // Emitted on burning of OURX (aka liquidity withdrawal)
    event Burn(address indexed sender, uint redeemedETH, uint redeemedOURT, uint burnedOURX);
    event Swap(
        address indexed sender,
        swapReport swapin,
        swapReport swapout,
        address indexed to
    ); // Emitted on swapping
    event Sync(uint reserveETH, uint reserveOURT); // Emitted when the contract matches the balances and the reserves

    /** INIT */

    /**
     * On deployment, OurDEX contract requires the address of the OURToken contract deployed on the same chain
     * When testing, this proved a bit of a hassle since the OURTToken contract is in a different project.
     * What's even more problematic is using the ABI that means we'd have to build the other project then
     * copy paste the ABI file in this project, therefore, as a solution for testing, I copied the OURTToken contract
     * to this project and will deploy it on unit tests with the OurDEX contract.
     * Later when deploying on Testnet and Mainnet, we should deploy OURTToken first, feed the address into the deployment of OurDEX
     * and then use both address to initialize the arbitrage contract as it requires both to interact with.
    */

    constructor(address _token, uint fee) OurDEXToken("OurDEX", "OURX", _msgSender()){
        ourToken = _token;
        feeFactor = fee;
        MINIMUM_LIQUIDITY = 10**3*10**18;
        MAXIMUM_LIQUIDITY = 10**32*10**18;
        unlocked = 1;
    }

    /** PUBLIC VIEWS */

    /**
     * Returns the reserves held in the contract and that represent the liquidity pool
     * also returns a block timestamp, the further back the timestamp is from Date.now(),
     * the less "reliable" the numbers returned here due to swaps or changes to liquidity that are
     * yet to be added to the next block and effectively change the reserve amounts
    */
    function getReserves() public view returns (uint, uint, uint32) {
        return (reserveETH, reserveOURT, blockTimestampLast);
    }

    /** Retreives the min and max liquidity */
    function getLiquidityBounds() public view returns (uint, uint) {
        return (MINIMUM_LIQUIDITY, MAXIMUM_LIQUIDITY);
    }

    /**
     * Given a deposited liquidity of ETH, how much OURT liquidity is required to match it's value based on the ratio in the pool
    */
    function calcLiquidityRequirementETH(uint todepETH) public view returns (uint _reqETH, uint _reqOURT, uint _mintedOURX) {
        // get reserves and total supply
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        uint totalSupply = totalSupply();

        // get quote from AmountOut
        _reqOURT = _getAmountMatch(todepETH, _reserveETH, _reserveOURT);
        _reqETH = todepETH;

        // calculate aprox minted shares as OURX
        _mintedOURX = _calculateOURXMintable(totalSupply, _reqETH, _reserveETH, _reqOURT, _reserveOURT);
    }

    /**
     * Given a deposited liquidity of OURT, how much ETH liquidity is required to match it's value based on the ratio in the pool
    */
    function calcLiquidityRequirementOURT(uint todepOURT) public view returns (uint _reqETH, uint _reqOURT, uint _mintedOURX) {
        // get reserves and total supply
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        uint totalSupply = totalSupply();

        // get quote from AmountOut
        _reqETH = _getAmountMatch(todepOURT, _reserveOURT, _reserveETH);
        _reqOURT = todepOURT;

        // calculate aprox minted shares as OURX
        _mintedOURX = _calculateOURXMintable(totalSupply, _reqETH, _reserveETH, _reqOURT, _reserveOURT);
    }

    /**
     * Given an amount of OURX, returns the total amount of ETH-OURT that the account can withdraw (+fees)
    */
    function calculateOnBurnValue(uint amountOURX) public view returns (uint amountETH, uint amountOURT){
        // get reserves
        (uint _resETH, uint _resOURT, ) = getReserves();

        // get values from calcForBurn
        return _calcForBurn(amountOURX, _resETH, _resOURT, totalSupply());
    }

    /**
     * Given an address, returns the liquidity history (when was liquidity added and what's its status)
    */
    function getAccountLiquidityHistory(address foracc) public view returns (liquidityRec[] memory) {
        // Check that account requesting history only for itself
        require(foracc == _msgSender(), 'OurDEX: ACCESS_REJECTED_INVALID_ADDRESS');
        return liquidtyRecords[foracc];
    }

    /** PUBLIC ACTIONS */

    /** Governance */

    /**
     * The function below can only be called by the governance contract when a proposition
     * is initiated to change the governance address -- temporary dictatorship a-la Rome(?)
    */
    function changeGovernance(address governance) public onlyOwner(){
        require(_msgSender() != governance, 'OurDEX: SAME_GOVERNANCE_ADDRESS');
        grantRole(DEFAULT_ADMIN_ROLE, governance);
        revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
        transferOwnership(governance);
    }

    /** Changes Maximum allowed pool liquidity */
    function changeMaxLiquidity(uint newMax) public onlyOwner(){
        MAXIMUM_LIQUIDITY = newMax;
    }

    /** Changes Minimum allowed pool liquidity */
    function changeMinLiquidity(uint newMin) public onlyOwner(){
        MINIMUM_LIQUIDITY = newMin;
    }

    /** Changes liquidity provider swap fees */
    function changeSwapFee(uint newFee) public onlyOwner(){
        feeFactor = newFee;
    }

    /** /Governance */

    /**
     * Public payable function to call when Account wants to deposit liquidity
     * ideally, calcLiquidityRequirementETH is called beforehand to show the
     * end-user what they are expected to send as tokens
    */
    function addLiquidity(uint amountOURT, uint maxOURT, uint minOURT, uint32 deadline) external payable ensure(deadline){
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // get liquidity bounds
        (, uint maxLiq) = getLiquidityBounds();
        // assign addresses
        address from = _msgSender();
        require(from != address(0), 'OurDEX: ZERO_ADDRESS_SENDER');
        // get ETH amount sent
        require(msg.value > 0, 'OurDEX: NO_ETHER_SENT');
        uint amountETH = msg.value;
        { // scoping to avoid stack too deep error
            // calculate expected sent balance
            uint _amountETH = msg.value;
            uint _amountOURT = amountOURT;
            // on initial liquidity: skips this conditional code
            if(_reserveETH > 0 && _reserveOURT > 0){
                (_amountETH, _amountOURT, ) = calcLiquidityRequirementETH(amountETH);
            }
            // check liquidity out-of-bounds (calculating K-next)
            require(_reserveETH.add(_amountETH).mul(_reserveOURT.add(_amountOURT)) <= maxLiq, 'OurDEX: MAXIMUM_POOL_LIQUIDITY');
            // check that liquidity requested to add matches the expected amount
            require(_amountETH == amountETH, "OurDEX: INVALID_LIQUIDITY_ETH");
            require(_amountOURT >= minOURT && amountOURT <= maxOURT, "OurDEX: INVALID_LIQUIDITY_OURT");
            // transfer token from user
            _safeTransferFromOURT(from, address(this), _amountOURT);
        }
        // calculating and minting OURX tokens as shares
        __mint(from, _reserveETH, _reserveOURT);
    }

    function removeLiquidity(uint redeemedOURX, uint32 deadline) external ensure(deadline) {
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // getting balances for token and ETH
        uint balanceETH = address(this).balance;
        uint balanceOURT = IERC20(ourToken).balanceOf(address(this));
        // total OURX supply
        uint _totalSupply = totalSupply();
        // get liquidity bounds
        (uint minLiq, ) = getLiquidityBounds();
        // assign addresses
        address to = _msgSender();
        // getting total OURX account is holding
        uint balanceOURX = balanceOf(to);
        //Check OURX total is > than OURX redeemed
        require(balanceOf(to) >= redeemedOURX, "OurDEX: INSUFFICIENT_OURX_TOKENS");
        // Check liquidity in reserves
        require(_reserveETH > 0 && _reserveOURT > 0, "OurDEX: INSUFFICIENT_RESERVE_LIQUIDITY");
        // using balances ensures pro-rata distribution
        (uint amountETH, uint amountOURT) = _calcForBurn(redeemedOURX, balanceETH, balanceOURT, _totalSupply);
        // check minimum liquidity
        require(_reserveETH.sub(amountETH).mul(_reserveOURT.sub(amountOURT)) >= minLiq, 'OurDEX: MINIMUM_POOL_LIQUIDITY');
        // Call burn to complete transfers and update reserves
        __burn(to, redeemedOURX, balanceOURX, balanceETH, balanceOURT, _totalSupply);

    }

    // Gets an estimated quote for swaping ETH->OURT
    function getQuoteForOURT(uint amountETH) external view returns (uint amountOURT) {
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // get quote
        amountOURT = _getAmountOut(amountETH, _reserveETH, _reserveOURT, feeFactor);
    }

    // Gets an estimated quote for swapper ETH->OURT given the amount of OURT required out
    function getReverseQuoteForOURT(uint amountOURT) external view returns (uint amountETH) {
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // get quote
        amountETH = _getAmountIn(amountOURT, _reserveETH, _reserveOURT, feeFactor);
    }

    // Gets an estimated quote for swaping OURT->ETH
    function getQuoteForETH(uint amountOURT) external view returns (uint amountETH) {
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // get quote
        amountETH = _getAmountOut(amountOURT, _reserveOURT, _reserveETH, feeFactor);
    }

    // Gets an estimated quote for swaping OURT->ETH given the amount of ETH required out
    function getReverseQuoteForETH(uint amountETH) external view returns (uint amountOURT) {
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // get quote
        amountOURT = _getAmountIn(amountETH, _reserveOURT, _reserveETH, feeFactor);
    }

    // Swap ETH to OURT
    function buyOURT(uint maxOURT, uint minOURT, uint32 deadline) external payable ensure(deadline){
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();

        // get sent ETH amount
        uint spentETH = msg.value;
        require(spentETH > 0, 'OurDEX: ZERO_ETH_SENT');

        // calculate OURT bought
        uint boughtOURT = _getAmountOut(spentETH, _reserveETH, _reserveOURT, feeFactor);
        require(maxOURT >= boughtOURT && boughtOURT >= minOURT, 'OurDEX: SLIPPAGE_RATE_EXCEEDED');

        //initiate swap
        _swap(0, boughtOURT, _msgSender());
    }

    // Swap ETH to OURT
    function sellOURT(uint amountOURT, uint maxETH, uint minETH, uint32 deadline) external ensure(deadline){
        // get reserves
        (uint _reserveETH, uint _reserveOURT, ) = getReserves();
        // get sender
        address sender = _msgSender();

        // get sent ETH amount
        uint spentOURT = amountOURT;
        require(spentOURT > 0, 'OurDEX: ZERO_OURT_SENT');

        // calculate OURT bought
        uint boughtETH = _getAmountOut(spentOURT, _reserveOURT, _reserveETH, feeFactor);
        require(maxETH >= boughtETH && boughtETH >= minETH, 'OurDEX: SLIPPAGE_RATE_EXCEEDED');

        // transfer token from user
        _safeTransferFromOURT(sender, address(this), amountOURT);

        //initiate swap
        _swap(boughtETH, 0, sender);
    }

    /** PRIVATE FUNCTIONS -- THESE FUNCTIONS SHOULD BE CALLED FROM OTHER FUNCTIONS WITH PROPER CHECKS */

    // Calculates the amount of OURX to be minted given parameters
    function _calculateOURXMintable(uint totalSupply, uint reqETH, uint resvETH, uint reqOURT, uint resvOURT)
        private pure returns (uint mintable){
        mintable = Math.min(uint(reqETH).mul(totalSupply) / resvETH, uint(reqOURT).mul(totalSupply) / resvOURT);
    }

    // transfers OURT token from OurDEX to supplied address
    function _safeTransferOURT(address to, uint value) private {
        bool success = IERC20(ourToken).transfer(to, value);
        require(success, 'OurDEX: OURT_TRANSFER_FAILED');
    }

    // when using to send ETH to another CONTRACT and not a wallet,
    // one should make sure that receiving contract(ie: arbitrage) has payable function
    function _safeTransferETH(address payable to, uint value) private {
        to.transfer(value);
    }

    // transfers OURT token from supplied address to supplied address
    function _safeTransferFromOURT(address from, address to, uint value) private {
        bool success = IERC20(ourToken).transferFrom(from, to, value);
        require(success, 'OurDEX: OURT_TRANSFER_FAILED');
    }

    function _updateLiquidityRecords (address to, uint amountETH, uint amountOURT, bool status) private {
        // add liquidity record to mapping
        liquidtyRecords[to].push(liquidityRec(block.timestamp, status, amountETH, amountOURT)); /* solium-disable-line */
    }

    // Calculates per rata returned ETH and OURT from OURX burn
    function _calcForBurn(uint amountOURX, uint balanceETH, uint balanceOURT, uint _totalSupply)
        private pure returns (uint amountETH, uint amountOURT){
        amountETH = uint(amountOURX).mul(balanceETH) / _totalSupply;
        amountOURT = uint(amountOURX).mul(balanceOURT) / _totalSupply;
    }

    // update reserves and, on the first call per block, pushes to price history
    function _update(uint balanceETH, uint balanceOURT, uint _reserveETH, uint _reserveOURT) private {
        require(balanceETH <= type(uint).max && balanceOURT <= type(uint).max, 'OurDEX: OVERFLOW'); // check for potential UINT overflow

        uint32 blockTimestamp = uint32(block.timestamp % 2**32); /* solium-disable-line */ // getting current block timestamp and casting to proper format
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // timeElapsed > 0 means new block

        if (timeElapsed > 0 && _reserveETH != 0 && _reserveOURT != 0) {
            priceHistory[blockTimestamp] = uint(_reserveETH / _reserveOURT); // add to history map
        }

        reserveETH = uint(balanceETH); // update ETH reserves
        reserveOURT = uint(balanceOURT); // update OURT reserves
        blockTimestampLast = blockTimestamp;

        emit Sync(reserveETH, reserveOURT);
    }

    // this low-level function should be called from a public function which performs important safety checks
    function __mint(address to, uint _reserveETH, uint _reserveOURT) internal lock{
        uint totalSupply = totalSupply();
        uint mintedOURX = 0;

        uint balanceETH = address(this).balance; // getting contract's ETH balance representing new ETH pool
        // getting contract's OURT balance representing new OURT pool from OURTToken contract
        uint balanceOURT = IERC20(ourToken).balanceOf(address(this));
        uint amountETH = balanceETH.sub(_reserveETH); // ETH amount just received by OurDEX
        uint amountOURT = balanceOURT.sub(_reserveOURT); // OURT amount just received by OurDEX

        // Calculating OURX to mint
        if (totalSupply == 0) {
            // initial liquidity provision OURX share calculation

            /**
             * I've temporarily disable minimum liquidity, eventhough i believe it is VERY important
             * to maintain initial liquidity but at this stage (testing) and before we can play around
             * with these numbers, minimum liquidity is not important.
             * once minimum liquidity is to be set there are 2 problems to solve
             * 1- Investor fund locked in pool forever, ROI?
             * 2- Tokens in ERC20 cannot be minted to address 0 so they must be minted to supplied address
             *    and then burned.
             *
             * After further thought and the introduction of governance, this is being checked at the
             * "addLiquidity" and "removeLiquidity" actions
            */

            mintedOURX = SafeSqrt.sqrt(amountETH.mul(amountOURT));//.sub(MINIMUM_LIQUIDITY);
           // _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            // liquidity provision OURX share calculation
            mintedOURX = _calculateOURXMintable(totalSupply, amountETH, _reserveETH, amountOURT, _reserveOURT);
        }

        // Checking to-mint acount and minting
        require(mintedOURX > 0, 'OurDEX: INSUFFICIENT_LIQUIDITY_MINTED');
        require(to != address(0), 'OurDEX: ZERO_ADDRESS_MINTING');
        _mint(to, mintedOURX);

        // Update reserves with new balances
        _update(balanceETH, balanceOURT, _reserveETH, _reserveOURT);

        // Update liquidity records
        _updateLiquidityRecords(to, amountETH, amountOURT, true);

        /**
         * It seems in uniswap, when the fees are on, the fees are calculated by delta K therefore last K is
         * It might be benificial to save the account liquidity history or just saving the initial liquidity value
         * and recalculating the OURX tokens' value from the current pool to show the difference to the user
        */
        /** kLast = uint112(reserveETH).mul(reserverOURT);  */

        emit Mint(msg.sender, amountETH, amountOURT, mintedOURX);
    }

    // this low-level function should be called from a public function which performs important safety checks
    function __burn(address to, uint amountOURX, uint balanceOURX, uint balanceETH, uint balanceOURT, uint __totalSupply) internal lock{
        (uint _reserveETH, uint _reserveOURT, ) = getReserves(); // gas savings

        // check that tokens to burn are less than or equal to total OURX held by account
        require(amountOURX <= balanceOURX, 'OurDEX: INSUFFICIENT_LIQUIDITY_BURNED');

        // calculate the amount that should be returned to the account of both token and ETH
        // using balances ensures pro-rata distribution
        (uint amountETH, uint amountOURT) = _calcForBurn(amountOURX, balanceETH, balanceOURT, __totalSupply);

        // check amounts
        require(amountETH > 0 && amountOURT > 0, 'OurDEX: INSUFFICIENT_LIQUIDITY_BURNED');

        // call burn on 'to' address for requested burn amount
        _burn(to, amountOURX);

        // initiate transfers for ETH and OURT
        _safeTransferETH(payable(to), amountETH);
        _safeTransferOURT(to, amountOURT);

        // update balances and reserves
        _update(address(this).balance, IERC20(ourToken).balanceOf(address(this)), _reserveETH, _reserveOURT);

        // Update liquidity records
        _updateLiquidityRecords(to, amountETH, amountOURT, false);

        emit Burn(msg.sender, amountETH, amountOURT, amountOURX);
    }

    // this low-level function should be called from a public function which performs important safety checks
    function _swap(uint outETH, uint outOURT, address to) internal lock{
        require(outETH > 0 || outOURT > 0, 'OurDEX: INSUFFICIENT_OUTPUT_AMOUNT');

        (uint _reserveETH, uint _reserveOURT,) = getReserves(); // gas savings
        require(outETH < _reserveETH && outOURT < _reserveOURT, 'OurDEX: INSUFFICIENT_LIQUIDITY');

        uint balanceETH;
        uint balanceOURT;

        /**
         * I'm not entirely sure why there is scoping here in the code from uniswap, it could be due to
         * to the fact that in uniswap this contract is being called by a factory contract which is called by
         * a router contract, this cascade could be causing "stack too deep" errors
         * Will need to research this further
        */

        // check to address validity
        require(to != ourToken, 'OurDEX: INVALID_TO');

        // trigger the appropriate transfer function when value of out > 0
        if (outETH > 0) _safeTransferETH(payable(to), outETH); // optimistically transfer ETH
        if (outOURT > 0) _safeTransferOURT(to, outOURT); // optimistically transfer tokens

        // get new balances
        balanceETH = address(this).balance;
        balanceOURT = IERC20(ourToken).balanceOf(address(this));

        // This is a redundant check as the input sufficiency should already be checked in the function calling this one
        uint amountETHIn = balanceETH > _reserveETH - outETH ? balanceETH - (_reserveETH - outETH) : 0;
        uint amountOURTIn = balanceOURT > _reserveOURT - outOURT ? balanceOURT - (_reserveOURT - outOURT) : 0;
        require(amountETHIn > 0 || amountOURTIn > 0, 'OurDEX: INSUFFICIENT_INPUT_AMOUNT');

        /**
         * I'm not entirely sure why the amounts in are being multiplied by 3 here.
         * on paper, doing the calculations, this seems valid as after a swap the
         * left hand term "balance0Adjusted.mul(balance1Adjusted)" will always be
         * smaller than the right hand term "uint112(_reserve0).mul(_reserve1).mul(1000**2)"
         * Even though on paper this works, more research needs to be made into this to
         * see if there are better -more understandable- approaches.
        */

        uint balanceETHAdjusted = balanceETH.mul(1000).sub(amountETHIn.mul(3));
        uint balanceOURTAdjusted = balanceOURT.mul(1000).sub(amountOURTIn.mul(3));
        require(balanceETHAdjusted.mul(balanceOURTAdjusted) >= _reserveETH.mul(_reserveOURT).mul(1000**2), 'OurDEX: K');

        // Syncing reserves and balances
        _update(balanceETH, balanceOURT, _reserveETH, _reserveOURT);

        // create swap reports for event
        swapReport memory _in = swapReport(outETH > 0 ? ourToken : address(0), outETH > 0 ? amountOURTIn : amountETHIn);
        swapReport memory _out = swapReport(outETH > 0 ?  address(0) : ourToken, outETH > 0 ? outETH : outOURT);

        emit Swap(msg.sender, _in, _out, to);
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function _getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint feeFac) internal pure returns (uint amountOut) {
        require(amountIn > 0, 'OurDEX: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'OurDEX: INSUFFICIENT_LIQUIDITY');
        uint amountInWithoutFee = amountIn.mul(feeFac); // 0.4% liquidity provider fee
        amountOut = amountInWithoutFee.mul(reserveOut) / reserveIn.mul(1000).add(amountInWithoutFee);
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function _getAmountIn(uint amountOut, uint reserveIn, uint reserveOut, uint feeFac) internal pure returns (uint amountIn) {
        require(amountOut > 0, 'OurDEX: INSUFFICIENT_OUTPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'OurDEX: INSUFFICIENT_LIQUIDITY');
        amountIn = reserveIn.mul(amountOut).mul(1000) / reserveOut.sub(amountOut).mul(feeFac); // 0.4% liquidity provider fee
    }

    // given an input amount of an asset and pair reserves, returns a required input amount of the other asset for liquidity provision
    function _getAmountMatch(uint amountIn, uint reserveIn, uint reserveOut) internal pure returns (uint amountReq) {
        require(amountIn > 0, 'OurDEX: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'OurDEX: INSUFFICIENT_LIQUIDITY');
        amountReq = (reserveOut.mul(amountIn) / reserveIn);
    }
}