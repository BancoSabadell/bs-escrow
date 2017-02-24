# bs-escrow

### A js wrapper around BSEscrow contract to simplify its consumption.

## Installation
```bash
npm install bs-escrow
```

## Usage

### Clarifications
* Every method of BSEscrow's api has been promisified.
* Some of its methods require to call `personal` under the hood in order to unlock an account.

### Initialization
Import BSEscrow module and create an instance passing by constructor a Web3 instance, a [BSToken](https://github.com/BancoSabadell/bs-token) instance and a `config` object with the next values:

```javascript
const BSEscrow = require('bs-escrow');
const escrow = new BSEscrow(web3,  {
    admin: { account: admin, password: password },
    bsTokenLib : bsTokenLib,
    contractEscrow: contractEscrow
});
```

### Api consumption

#### *Calls*

**`balanceOf(targetAddress)`** returns the total amount of tokens available for the specified address.

**`getEscrow(assetId)`** returns an object representing an escrow containing these properties: buyer, seller, assetPrice and state (0 = Held, 1 = Cancelled, 2 = Fulfilled, 3 = BuyerProposeCancellation, 4 = SellerDisagreeProposalCancellation).

#### *Transactions*

**`createEscrow(buyer, buyerPass, seller, assetPrice, assetId)`** the merchant creates an escrow.

**`cancelEscrow(passwordSeller, assetId)`** the seller cancels an existing escrow.

**`cancelEscrowProposal(passwordBuyer, assetId)`** the buyer makes a proposal to cancel the escrow.

**`validateCancelEscrowProposal(passwordSeller, assetId, validate)`** the seller validates a proposal of cancellation.

**`cancelEscrowArbitrating(passwordOwner, assetId)`** the merchant cancels the escrow using arbitration when the escrow has been reached a conflict state.

**`fulfillEscrow(passwordBuyer, assetId)`** the buyer fulfills the escrow.

**`fulfillEscrowArbitrating(passwordOwner, assetId)`** the merchant fulfills the escrow using arbitration when the escrow has been reached a conflict state.
