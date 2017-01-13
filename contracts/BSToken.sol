import "Ownable.sol";
import "TokenRecipient.sol";

pragma solidity ^0.4.2;

contract BSToken is Ownable {
    /* Public variables of the token */
    string public standard = 'BSToken 0.1';
    string public name;
    string public symbol;
    uint8 public decimals;
    /* Total token supply */
    uint256 public totalSupply;
    mapping (address => bool) public frozenAccount;
    /* Get the account balance */
    mapping (address => uint256) public balanceOf;
    /* Returns the amount which _spender is still allowed to withdraw from _owner */
    mapping (address => mapping (address => uint256)) public allowance;

    /* Triggered when tokens are transferred */
    event Transfer(address indexed from, address indexed to, uint256 value);
    /* Triggered whenever approve() is called */
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event CashOut(address indexed receiver, uint256 amount, string bankAccount);
    event FrozenFunds(address target, bool frozen);

    /* Initializes contract with initial supply tokens to the creator of the contract */
    function BSToken(
        uint256 initialSupply,
        string tokenName,
        uint8 decimalUnits,
        string tokenSymbol
        ) {
        balanceOf[msg.sender] = initialSupply;
        totalSupply = initialSupply;
        name = tokenName;                                   // Set the name for display purposes
        symbol = tokenSymbol;                               // Set the symbol for display purposes
        decimals = decimalUnits;                            // Amount of decimals for display purposes
    }

    /* Send 'value' amount of tokens to address 'to' */
    function transfer(address to, uint256 value)
        stopInEmergency accountIsNotFrozen(msg.sender) enoughFunds(msg.sender, value) {
        if (balanceOf[to] + value < balanceOf[to]) throw; // Check for overflows
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        Transfer(msg.sender, to, value);
    }

    /* Send 'value' amount of tokens from address 'from' to address 'to'

     The transferFrom method is used for a withdraw workflow, allowing contracts
     to send tokens on your behalf, for example to "deposit" to a contract address
     and/or to charge fees in sub-currencies; the command should fail unless the
     'from' account has deliberately authorized the sender of the message via some
     mechanism
     */
    function transferFrom(address from, address to, uint256 value)
    stopInEmergency accountIsNotFrozen(from) enoughFunds(from, value) {
        if (balanceOf[to] + value < balanceOf[to]) throw;  // Check for overflows
        if (value > allowance[from][msg.sender]) throw;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        Transfer(from, to, value);
    }

    /* Allow 'spender' to withdraw from your account, multiple times, up to the
     'value' amount. If this function is called again it overwrites the current
     allowance with 'value'.
     */
    function approve(address spender, uint256 value)
        stopInEmergency accountIsNotFrozen(msg.sender) enoughFunds(msg.sender, value){
        allowance[msg.sender][spender] = value;
        Approval(msg.sender, spender, value);
    }

    /* Approve and then communicate the approved contract in a single tx */
    function approveAndCall(address spender, address to, string id, uint256 value)
        stopInEmergency accountIsNotFrozen(msg.sender) enoughFunds(msg.sender, value) {
        TokenRecipient delegate = TokenRecipient(spender);
        approve(spender, value);
        delegate.receiveApproval(msg.sender, to, id, value);
    }

    function cashIn(address target, uint256 amount)
        onlyOwner stopInEmergency accountIsNotFrozen(target) {
        balanceOf[target] += amount;
        totalSupply += amount;
        Transfer(0, this, amount);
        Transfer(this, target, amount);
    }

    function cashOut(uint256 amount, string bankAccount)
        stopInEmergency accountIsNotFrozen(msg.sender) enoughFunds(msg.sender, amount) {
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        CashOut(msg.sender, amount, bankAccount);
    }

    function freezeAccount(address target, bool freeze) onlyOwner {
        frozenAccount[target] = freeze;
        FrozenFunds(target, freeze);
    }

    modifier accountIsNotFrozen(address target) {
        if (frozenAccount[target])
            throw;
        _;
    }

    modifier enoughFunds(address target, uint256 amount) {
        if (balanceOf[target] < amount)
            throw;
        _;
    }

    /* This unnamed function is called whenever someone tries to send ether to it */
    function () {
        throw;     // Prevents accidental sending of ether
    }
}