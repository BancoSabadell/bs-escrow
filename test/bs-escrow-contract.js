'use strict';

const TestRPC = require('ethereumjs-testrpc');
const Web3 = require('web3');
const BSTokenData = require('bs-token-data');
const BSTokenBanking = require('bs-token-banking');
const BSToken = require('bs-token');
const Escrow = require('../src/lib');
const Promise = require('bluebird');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const assert = chai.assert;
chai.use(chaiAsPromised);
chai.should();

const provider = TestRPC.provider({
    accounts: [{
        index: 0,
        secretKey: '0x998c22e6ab1959d6ac7777f12d583cc27d6fb442c51770125ab9246cb549db80',
        balance: 200000000
    }, {
        index: 1,
        secretKey: '0x998c22e6ab1959d6ac7777f12d583cc27d6fb442c51770125ab9246cb549db81',
        balance: 200000000
    }, {
        index: 2,
        secretKey: '0x998c22e6ab1959d6ac7777f12d583cc27d6fb442c51770125ab9246cb549db82',
        balance: 200000000
    }, {
        index: 3,
        secretKey: '0x998c22e6ab1959d6ac7777f12d583cc27d6fb442c51770125ab9246cb549db83',
        balance: 200000000
    }]
});

const web3 = new Web3(provider);

Promise.promisifyAll(web3.eth);
Promise.promisifyAll(web3.personal);

describe('Escrow contract', function () {
    const gas = 3000000;
    const assetId1 = '1';
    const assetId2 = '2';
    const assetId3 = '3';
    const assetId4 = '4';
    const assetId5 = '5';
    const assetPrice = 400;
    const admin = '0x5bd47e61fbbf9c8b70372b6f14b068fddbd834ac';
    const buyer = '0x25e940685e0999d4aa7bd629d739c6a04e625761';
    const seller = '0x6128333118cef876bd620da1efa464437470298d';
    let bsTokenFrontend = null;
    let bsTokenBanking = null;
    let bsTokenData = null;

    var escrow = null;

    before(function() {
        this.timeout(60000);

        return BSTokenData.deployedContract(web3, admin, gas)
            .then(contract => {
                bsTokenData = contract;
                return BSTokenBanking.deployedContract(web3, admin, bsTokenData, gas);
            })
            .then((contract) => {
                bsTokenBanking = contract;
                return bsTokenData.addMerchantAsync(admin, { from: admin, gas: gas });
            })
            .then(() => BSToken.deployedContract(web3, admin, admin, bsTokenData, gas))
            .then((contract) => {
                bsTokenFrontend = contract;
                return Escrow.deployedContract(web3, admin, bsTokenFrontend, gas);
            })
            .then((contract) => escrow = contract);
    });

    describe('create escrow calling tokens.approveAndCall', () => {
        it('add cash to buyer', () => {
            return bsTokenBanking.cashInAsync(buyer, assetPrice, { from: admin, gas: gas});
        });

        it('check balance buyer', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('should be fulfilled', () => {
            return bsTokenFrontend.approveAndCallAsync(escrow.address, seller, assetId1, assetPrice, {
                from: buyer,
                gas: gas
            });
        });

        it('check balance buyer', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check escrow state after', () => {
            return escrow.getAsync(assetId1).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 0);
            });
        });

        it('add cash to buyer', () => {
            return bsTokenBanking.cashInAsync(buyer, assetPrice, { from: admin, gas: gas});
        });

        it('check balance buyer', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });
    });

    describe('cancelEscrowProposal finish without arbitration', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowProposalAsync(assetId2, {
                from: buyer,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {
                from: seller,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {from: buyer, gas: gas});
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check escrow state after', () => {
            return escrow.getAsync(assetId1, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 3);
            });
        });

        it('should be rejected if the state of the escrow is not held', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {
                from: buyer,
                gas: gas
            }).should.eventually.be.rejected;
        });
    });

    describe('validateCancelEscrowProposal finish without arbitration', () => {
        const validate = true;

        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId2, validate, {
                from: seller,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: buyer,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return bsTokenFrontend.startEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: seller, gas: gas
            });

            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return bsTokenFrontend.stopEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be fulfilled', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {from: seller, gas: gas});
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice * 2);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check escrow state after', () => {
            return escrow.getAsync(assetId1, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 1);
            });
        });

        it('should be rejected if the state of the escrow is not BuyerProposeCancellation', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: seller,
                gas: gas
            }).should.eventually.be.rejected;
        });
    });

    describe('cancelEscrowProposal finish with arbitration', () => {
        it('create another escrow', () => {
            return bsTokenFrontend.approveAndCallAsync(escrow.address, seller, assetId2, assetPrice, {
                from: buyer,
                gas: gas
            });
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowProposalAsync(assetId2, {from: buyer, gas: gas});
        });
    });

    describe('validateCancelEscrowProposal finish with arbitration', () => {
        const validate = false;

        it('should be fulfilled', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId2, validate, {from: seller, gas: gas});
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check escrow state after', () => {
            return escrow.getAsync(assetId2, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 4);
            });
        });

        it('should be rejected if the state of the escrow is not BuyerProposeCancellation', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId2, validate, {
                from: seller,
                gas: gas
            }).should.eventually.be.rejected;
        });
    });

    describe('cancelEscrow owner with arbitration', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowArbitratingAsync('6rdtcdrc4a3', {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {
                from: buyer,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {
                from: seller,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return bsTokenFrontend.startEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.cancelEscrowArbitratingAsync(assetId2, {from: admin, gas: gas});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return bsTokenFrontend.stopEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {from: admin, gas: gas});
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice * 2);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check escrow state after', () => {
            return escrow.getAsync(assetId2, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 1);
            });
        });

        it('should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });
    });

    describe('cancelEscrow seller', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: seller, gas: gas}).should.eventually.be.rejected;
        });

        it('create another escrow', () => {
            return bsTokenFrontend.approveAndCallAsync(escrow.address, seller, assetId3, assetPrice, {
                from: buyer,
                gas: gas
            });
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: buyer, gas: gas}).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: admin, gas: gas}).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return bsTokenFrontend.startEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.cancelEscrowAsync(assetId3, {from: seller, gas: gas});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return bsTokenFrontend.stopEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: seller, gas: gas});
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice * 2);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check escrow state after', () => {
            return escrow.getAsync(assetId3, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 1);
            });
        });

        it('should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: seller, gas: gas}).should.eventually.be.rejected;
        });
    });

    describe('fulfillEscrow buyer', () => {
        it('should be rejected if the there is no previous escrow for this assetId', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: gas}).should.eventually.be.rejected;
        });

        it('create another escrow', () => {
            return bsTokenFrontend.approveAndCallAsync(escrow.address, seller, assetId4, assetPrice, {
                from: buyer,
                gas: gas
            });
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: admin, gas: gas}).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: seller, gas: gas}).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return bsTokenFrontend.startEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: gas});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return bsTokenFrontend.stopEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be fulfilled', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: gas});
        });

        it('check escrow state', () => {
            return escrow.getAsync(assetId4, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 2);
            });
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not held', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: gas}).should.eventually.be.rejected;
        });
    });

    describe('fulfillEscrow owner with arbitration', () => {
        it('should be rejected if the there is no previous escrow for this assetId', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('add cash to buyer', () => {
            return bsTokenBanking.cashInAsync(buyer, assetPrice, { from: admin, gas: gas});
        });

        it('create another escrow', () => {
            return bsTokenFrontend.approveAndCallAsync(escrow.address, seller, assetId5, assetPrice, {
                from: buyer,
                gas: gas
            });
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('buyer make a proposal of cancellation', () => {
            return escrow.cancelEscrowProposalAsync(assetId5, {from: buyer, gas: gas});
        });

        it('seller disagree with this a proposal of cancellation', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId5, false, {from: seller, gas: gas});
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: buyer,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: seller,
                gas: gas
            }).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return bsTokenFrontend.startEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.fulfillEscrowArbitratingAsync(assetId5, {from: admin, gas: gas});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return bsTokenFrontend.stopEmergencyAsync({
                from: admin,
                gas: gas
            });
        });

        it('should be fulfilled', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {from: admin, gas: gas});
        });

        it('check escrow state', () => {
            return escrow.getAsync(assetId5, {from: buyer}).then(escrow => {
                assert.equal(escrow[0], buyer);
                assert.equal(escrow[1], seller);
                assert.equal(escrow[2].valueOf(), assetPrice);
                assert.equal(escrow[3], 2);
            });
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), assetPrice * 2);
            });
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: admin,
                gas: gas
            }).should.eventually.be.rejected;
        });
    });

    describe('transferOwnership', () => {
        it('should be rejected if the account is not the owner', () => {
            const promise = bsTokenFrontend.transferOwnershipAsync(buyer, {
                from: seller,
                gas: gas
            });

            return promise.should.eventually.be.rejected
        });

        it('check owner remains the same', () => {
            return bsTokenFrontend.ownerAsync().then(expected => {
                assert.equal(expected.valueOf(), admin);
            });
        });

        it('should be fulfilled', () => {
            return bsTokenFrontend.transferOwnershipAsync(buyer, {
                from: admin,
                gas: gas
            });
        });

        it('check owner has been updated', () => {
            return bsTokenFrontend.ownerAsync().then(expected => {
                assert.equal(expected.valueOf(), buyer);
            });
        });
    });
});