import "Ownable.sol";
import "BSTokenFrontend.sol";
import "TokenRecipient.sol";

pragma solidity ^0.4.2;

contract Escrow is Stoppable, TokenRecipient {
    BSTokenFrontend token;
    address bsTokenAddress;

    function Escrow(address someBsTokenAddress){
        bsTokenAddress = someBsTokenAddress;
        token = BSTokenFrontend(bsTokenAddress);
    }

    struct EscrowData {
        address buyer;
        address seller;
        uint assetPrice;
        // 0 = Held, 1 = Cancelled, 2 = Fulfilled, 3 = BuyerProposeCancellation, 4 = SellerDisagreeProposalCancellation
        uint state;
    }

	mapping (string => EscrowData) escrows;

    function receiveApproval(address from, address to, string id, uint256 value)
        stopInEmergency onlyBSToken escrowDoesNotExist(id) buyerAndSellerAreNotTheSameAccount(from, to) {
        token.transferFrom(from, this, value);
        escrows[id] = EscrowData(from, to, value, 0);
    }

    function cancelEscrowArbitrating(string assetId)
        onlyOwner escrowExists(assetId) escrowStateSellerDisagreeProposalCancellation(assetId) {
        doOnCancelEscrow(assetId);
    }

    function cancelEscrow(string assetId) public
        onlySeller(assetId) escrowExists(assetId) escrowStateHeld(assetId) {
        doOnCancelEscrow(assetId);
    }

    function cancelEscrowProposal(string assetId) public
        onlyBuyer(assetId) escrowExists(assetId) escrowStateHeld(assetId) {
        // change escrow estate to 'BuyerProposeCancellation'
        escrows[assetId].state = 3;
    }

    function validateCancelEscrowProposal(string assetId, bool validate) public
        onlySeller(assetId) escrowExists(assetId) escrowStateBuyerProposeCancellation(assetId) {
        if (validate) {
            doOnCancelEscrow(assetId);
        } else {
            // change escrow estate to 'SellerDisagreeProposalCancellation'
            escrows[assetId].state = 4;
        }
    }

    function fulfillEscrowArbitrating(string assetId)
        onlyOwner escrowExists(assetId) escrowStateSellerDisagreeProposalCancellation(assetId) {
        doOnFulfillEscrow(assetId);
    }

    function fulfillEscrow(string assetId) public
        onlyBuyer(assetId) escrowExists(assetId) escrowStateHeld(assetId) {
        doOnFulfillEscrow(assetId);
    }

    function get(string assetId) public constant returns(address buyer, address seller, uint assetPrice, uint state) {
        EscrowData escrow = escrows[assetId];
        buyer = escrow.buyer;
        seller = escrow.seller;
        assetPrice = escrow.assetPrice;
        state = escrow.state;
    }

    function doOnCancelEscrow(string assetId) internal
        stopInEmergency {
        EscrowData escrow = escrows[assetId];
        token.transfer(escrow.buyer, escrow.assetPrice);
        escrow.state = 1;
        /* delete escrows[assetId]; ??? */
    }

    function doOnFulfillEscrow(string assetId) internal
        stopInEmergency {
        EscrowData escrow = escrows[assetId];
        token.transfer(escrow.seller, escrow.assetPrice);
        escrow.state = 2;
        /* delete escrows[assetId]; ??? */
    }

    modifier buyerAndSellerAreNotTheSameAccount(address buyer, address seller) {
        if (buyer == seller)
            throw;
        _;
    }

    modifier escrowExists(string assetId) {
        if (escrows[assetId].buyer == address(0x0))
            throw;
        _;
    }

    modifier escrowDoesNotExist(string assetId) {
        if (escrows[assetId].buyer != address(0x0))
            throw;
        _;
    }

    modifier escrowStateHeld(string assetId) {
        if (escrows[assetId].state != 0)
            throw;
        _;
    }

    modifier escrowStateSellerDisagreeProposalCancellation(string assetId) {
        if (escrows[assetId].state != 4)
            throw;
        _;
    }

    modifier escrowStateBuyerProposeCancellation(string assetId) {
        if (escrows[assetId].state != 3)
            throw;
        _;
    }

    modifier onlyBuyer(string assetId) {
        if (msg.sender != escrows[assetId].buyer)
            throw;
        _;
    }

    modifier onlySeller(string assetId) {
        if (msg.sender != escrows[assetId].seller)
            throw;
        _;
    }

    modifier onlyBSToken() {
        if (msg.sender != bsTokenAddress)
            throw;
        _;
    }
}