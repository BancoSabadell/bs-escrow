'use strict';

const fs = require('fs');
const Promise = require('bluebird');
const path = require('path');
const Deployer = require('contract-deployer');
const BSToken = require('bs-token');

const NULL_ETHEREUM_ADDRESS = '0x0000000000000000000000000000000000000000';

class Escrow {
    constructor(web3, config) {
        this.config = config;
        this.web3 = web3;
        this.contract = config.contractEscrow;
        this.bsTokenLib = config.bsTokenLib;

        Promise.promisifyAll(this.web3.personal);
        Promise.promisifyAll(this.web3.eth);

        Promise.assert = (condition, message) =>
            Promise.try(() => {
                if (!condition) {
                    throw new Error(message);
                }
            });
    }

    unlockAdminAccount() {
        return this.web3.personal.unlockAccountAsync(
            this.config.admin.account,
            this.config.admin.password
        );
    }

    unlockAccount(account, password) {
        return this.web3.personal.unlockAccountAsync(account, password);
    }

    transferOwnership(target) {
        return this.unlockAdminAccount()
            .then(() => this.contract.transferOwnershipAsync(target, {
                from: this.config.admin.account,
                gas: 3000000
            }))
            .then(tx => ({ tx }));
    }

    getOwner() {
        return this.contract.ownerAsync()
            .then(owner => ({ owner }));
    }

    createEscrow(buyer, buyerPass, seller, assetPrice, assetId) {
        return Promise.assert(buyer !== seller, 'Buyer and seller can not be the same account')
            .then(() => this.getEscrow(assetId))
            .then(escrow => Promise.assert(escrow.buyer === NULL_ETHEREUM_ADDRESS,
                'There is already an escrow for this asset id'))
            .then(() => this.bsTokenLib.approveAndCall(buyer, buyerPass,
                this.contract.address, seller, assetId, assetPrice));
    }

    cancelEscrowArbitrating(passwordOwner, assetId) {
        return this.getEscrow(assetId)
            .then(escrow => Promise.join(
                Promise.assert(escrow.seller !== NULL_ETHEREUM_ADDRESS, 'There is no escrow for this asset id'),
                Promise.assert(escrow.state === 4, 'This escrow has not a proposal cancellation which has been rejected')
            ))
            .then(() => this.unlockAccount(this.config.admin.account, passwordOwner))
            .then(_ => this.contract.cancelEscrowArbitratingAsync(assetId, {
                from: this.config.admin.account,
                gas: 3000000
            }))
            .then(tx => ({ tx }));
    }

    cancelEscrow(passwordSeller, assetId) {
        return this.getEscrow(assetId)
            .then(escrow => Promise.join(
                Promise.assert(escrow.seller !== NULL_ETHEREUM_ADDRESS, 'There is no escrow for this asset id'),
                Promise.assert(escrow.state === 0, 'This escrow has been already cancelled or fulfilled')
            ).then(() => escrow))
            .then(escrow => this.unlockAccount(escrow.seller, passwordSeller)
                .then(_ => this.contract.cancelEscrowAsync(
                    assetId,
                    { from: escrow.seller, gas: 3000000 }
                ))
            )
            .then(tx => ({ tx }));
    }

    cancelEscrowProposal(passwordBuyer, assetId) {
        return this.getEscrow(assetId)
            .then(escrow => Promise.join(
                Promise.assert(escrow.seller !== NULL_ETHEREUM_ADDRESS, 'There is no escrow for this asset id'),
                Promise.assert(escrow.state === 0, 'This escrow has been already cancelled or fulfilled')
            ).then(() => escrow))
            .then(escrow => this.unlockAccount(escrow.buyer, passwordBuyer)
                .then(_ => this.contract.cancelEscrowProposalAsync(
                    assetId,
                    { from: escrow.buyer, gas: 3000000 }
                ))
            )
            .then(tx => ({ tx }));
    }

    validateCancelEscrowProposal(passwordSeller, assetId, validate) {
        return this.getEscrow(assetId)
            .then(escrow => Promise.join(
                Promise.assert(escrow.seller !== NULL_ETHEREUM_ADDRESS, 'There is no escrow for this asset id'),
                Promise.assert(escrow.state === 3, 'This escrow has not a proposal cancellation')
            ).then(() => escrow))
            .then(escrow => this.unlockAccount(escrow.seller, passwordSeller)
                .then(_ => this.contract.validateCancelEscrowProposalAsync(assetId, validate, {
                    from: escrow.seller,
                    gas: 3000000
                })))
            .then(tx => ({ tx }));
    }

    fulfillEscrowArbitrating(passwordOwner, assetId) {
        return this.getEscrow(assetId)
            .then(escrow => Promise.join(
                Promise.assert(escrow.seller !== NULL_ETHEREUM_ADDRESS, 'There is no escrow for this asset id'),
                Promise.assert(escrow.state === 4, 'This escrow has not a proposal cancellation which has been rejected')
            ))
            .then(() => this.unlockAccount(this.config.admin.account, passwordOwner))
            .then(_ => this.contract.fulfillEscrowArbitratingAsync(assetId, {
                from: this.config.admin.account,
                gas: 3000000
            }))
            .then(tx => ({ tx }));
    }

    fulfillEscrow(passwordBuyer, assetId) {
        return this.getEscrow(assetId)
            .then(escrow => Promise.join(
                Promise.assert(escrow.buyer !== NULL_ETHEREUM_ADDRESS, 'There is no escrow for this asset id'),
                Promise.assert(escrow.state === 0, 'This escrow has been already cancelled or fulfilled')
            ).then(() => escrow))
            .then(escrow => this.unlockAccount(escrow.buyer, passwordBuyer)
                .then(_ => this.contract.fulfillEscrowAsync(
                    assetId,
                    { from: escrow.buyer, gas: 3000000 }
                ))
            )
            .then(tx => ({ tx }));
    }

    getEscrow(assetId) {
        return this.contract.getAsync(assetId)
            .then(escrow => ({
                buyer: escrow[0],
                seller: escrow[1],
                assetPrice: escrow[2].toNumber(),
                state: escrow[3].toNumber()
            }));
    }
}

module.exports = Escrow;

module.exports.contracts = Object.assign(BSToken.contracts, {
    'Escrow.sol': fs.readFileSync(path.join(__dirname, '../contracts/Escrow.sol'), 'utf8')
});

module.exports.deployedContract = function (web3, admin, bsToken, gas) {
    const deployer = new Deployer(web3, {sources: Escrow.contracts}, 0);
    return deployer.deploy('Escrow', [bsToken.address], { from: admin, gas: gas });
};
