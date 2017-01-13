pragma solidity ^0.4.2;

contract TokenRecipient {
    // to be implemented for third party contracts which require to be notified when an allowance has been performed
    // pointing to their address contract.
    function receiveApproval(address from, address to, string id, uint256 value);
}
