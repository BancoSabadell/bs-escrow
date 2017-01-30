'use strict';

const Deployer = require('smart-contract-deployer');
const fs = require('fs');
const TestRPC = require('ethereumjs-testrpc');
const Web3 = require('web3');
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

describe('escrow', function () {
    const assetId1 = '1';
    const assetId2 = '2';
    const assetId3 = '3';
    const assetId4 = '4';
    const assetId5 = '5';
    const bankAccount = 'g4yr4ruenir4nueicj';
    const assetPrice = 400;
    const admin = '0x5bd47e61fbbf9c8b70372b6f14b068fddbd834ac';
    const buyer = '0x25e940685e0999d4aa7bd629d739c6a04e625761';
    const seller = '0x6128333118cef876bd620da1efa464437470298d';
    var token = null;
    var tokenData = null;
    var escrow = null;

    before(function() {
        this.timeout(60000);

        return BSToken.deploy(web3, admin, admin, 3000000)
            .then(deployment => {
                token = deployment.bsTokenFrontend;
                tokenData = deployment.bsTokenData;

                const contracts = Object.assign(BSToken.contracts, Escrow.contracts);
                const paramsConstructor = {'Escrow': [token.address]};

                const deployer = new Deployer({
                    web3: web3,
                    address: admin,
                    gas: 3000000
                });

                return deployer.deployContracts(contracts, paramsConstructor, ['Escrow']).then(contracts => {
                    escrow = web3.eth.contract(contracts.Escrow.abi).at(contracts.Escrow.address);
                    Promise.promisifyAll(escrow);
                });
            });
    });

    describe('create escrow calling tokens.approveAndCall', () => {
        it('add cash to buyer', () => {
            return cashIn(buyer, assetPrice);
        });

        it('check balance buyer', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('should be rejected if receiveApproval is called directly from another account rather than tokens', () => {
            const promise = escrow.receiveApprovalAsync(buyer, seller, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('freeze account', () => {
            return token.freezeAccountAsync(buyer, true, {
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if the account is frozen', () => {
            const promise = token.approveAndCallAsync(escrow.address, seller, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('unfreeze account', () => {
            return token.freezeAccountAsync(buyer, false, {
                from: admin,
                gas: 3000000
            });
        });

        it('start emergency', () => {
            return token.startEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = token.approveAndCallAsync(escrow.address, seller, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return token.stopEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if buyer and seller are both the same', () => {
            const promise = token.approveAndCallAsync(escrow.address, buyer, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('should be fulfilled', () => {
            return token.approveAndCallAsync(escrow.address, seller, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });
        });

        it('check balance buyer', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
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
            return cashIn(buyer, assetPrice);
        });

        it('check balance buyer', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('should be rejected if the assetId already exists', () => {
            const promise = token.approveAndCallAsync(escrow.address, seller, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });
            return promise.should.eventually.be.rejected
        });

        it('cashOut buyer', () => {
            return token.cashOutAsync(assetPrice, bankAccount, {
                from: buyer,
                gas: 3000000
            });
        });

        it('check balance buyer', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });
    });

    describe('cancelEscrowProposal finish without arbitration', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowProposalAsync(assetId2, {
                from: buyer,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {
                from: seller,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {
                from: admin,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowProposalAsync(assetId1, {from: buyer, gas: 3000000});
        });

        it('check balance buyer after', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
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
                gas: 3000000
            }).should.eventually.be.rejected;
        });
    });

    describe('validateCancelEscrowProposal finish without arbitration', () => {
        const validate = true;

        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId2, validate, {
                from: seller,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: buyer,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: admin,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return token.startEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.validateCancelEscrowProposalAsync(assetId1, validate, {
                from: seller, gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return token.stopEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be fulfilled', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId1, validate, {from: seller, gas: 3000000});
        });

        it('check balance buyer after', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
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
                gas: 3000000
            }).should.eventually.be.rejected;
        });
    });

    describe('cancelEscrowProposal finish with arbitration', () => {
        it('create another escrow', () => {
            return token.approveAndCallAsync(escrow.address, seller, assetId2, assetPrice, {
                from: buyer,
                gas: 3000000
            });
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowProposalAsync(assetId2, {from: buyer, gas: 3000000});
        });
    });

    describe('validateCancelEscrowProposal finish with arbitration', () => {
        const validate = false;

        it('should be fulfilled', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId2, validate, {from: seller, gas: 3000000});
        });

        it('check balance buyer after', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
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
                gas: 3000000
            }).should.eventually.be.rejected;
        });
    });

    describe('cancelEscrow owner with arbitration', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowArbitratingAsync('6rdtcdrc4a3', {
                from: admin,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {
                from: buyer,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {
                from: seller,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return token.startEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.cancelEscrowArbitratingAsync(assetId2, {from: admin, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return token.stopEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowArbitratingAsync(assetId2, {from: admin, gas: 3000000});
        });

        it('check balance buyer after', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
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
                gas: 3000000
            }).should.eventually.be.rejected;
        });
    });

    describe('cancelEscrow seller', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: seller, gas: 3000000}).should.eventually.be.rejected;
        });

        it('create another escrow', () => {
            return token.approveAndCallAsync(escrow.address, seller, assetId3, assetPrice, {
                from: buyer,
                gas: 3000000
            });
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: buyer, gas: 3000000}).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: admin, gas: 3000000}).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return token.startEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.cancelEscrowAsync(assetId3, {from: seller, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return token.stopEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowAsync(assetId3, {from: seller, gas: 3000000});
        });

        it('check balance buyer after', () => {
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
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
            return escrow.cancelEscrowAsync(assetId3, {from: seller, gas: 3000000}).should.eventually.be.rejected;
        });
    });

    describe('fulfillEscrow buyer', () => {
        it('should be rejected if the there is no previous escrow for this assetId', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: 3000000}).should.eventually.be.rejected;
        });

        it('create another escrow', () => {
            return token.approveAndCallAsync(escrow.address, seller, assetId4, assetPrice, {
                from: buyer,
                gas: 3000000
            });
        });

        it('should be rejected if the account is the admin', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: admin, gas: 3000000}).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: seller, gas: 3000000}).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return token.startEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return token.stopEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be fulfilled', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: 3000000});
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
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), assetPrice);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not held', () => {
            return escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: 3000000}).should.eventually.be.rejected;
        });
    });

    describe('fulfillEscrow owner with arbitration', () => {
        it('should be rejected if the there is no previous escrow for this assetId', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: admin,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('add cash to buyer', () => {
            return cashIn(buyer, assetPrice);
        });

        it('create another escrow', () => {
            return token.approveAndCallAsync(escrow.address, seller, assetId5, assetPrice, {
                from: buyer,
                gas: 3000000
            });
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: admin,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('buyer make a proposal of cancellation', () => {
            return escrow.cancelEscrowProposalAsync(assetId5, {from: buyer, gas: 3000000});
        });

        it('seller disagree with this a proposal of cancellation', () => {
            return escrow.validateCancelEscrowProposalAsync(assetId5, false, {from: seller, gas: 3000000});
        });

        it('should be rejected if the account is the buyer', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: buyer,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('should be rejected if the account is the seller', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: seller,
                gas: 3000000
            }).should.eventually.be.rejected;
        });

        it('start emergency', () => {
            return token.startEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.fulfillEscrowArbitratingAsync(assetId5, {from: admin, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('stop emergency', () => {
            return token.stopEmergencyAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be fulfilled', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {from: admin, gas: 3000000});
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
            return token.balanceOfAsync(buyer).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('check balance seller after', () => {
            return token.balanceOfAsync(seller).then(expected => {
                assert.equal(expected.valueOf(), assetPrice * 2);
            });
        });

        it('check balance contract after', () => {
            return token.balanceOfAsync(escrow.address).then(expected => {
                assert.equal(expected.valueOf(), 0);
            });
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.fulfillEscrowArbitratingAsync(assetId5, {
                from: admin,
                gas: 3000000
            }).should.eventually.be.rejected;
        });
    });

    describe('transferOwnership', () => {
        it('should be rejected if the account is not the owner', () => {
            const promise = token.transferOwnershipAsync(buyer, {
                from: seller,
                gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('check owner remains the same', () => {
            return token.ownerAsync().then(expected => {
                assert.equal(expected.valueOf(), admin);
            });
        });

        it('should be fulfilled', () => {
            return token.transferOwnershipAsync(buyer, {
                from: admin,
                gas: 3000000
            });
        });

        it('check owner has been updated', () => {
            return token.ownerAsync().then(expected => {
                assert.equal(expected.valueOf(), buyer);
            });
        });
    });

    function cashIn(target, amount) {
        return token.balanceOfAsync(target)
            .then(balance => {
                let prevBalance = Number(balance.valueOf());
                return tokenData.setBalanceAsync(target, prevBalance + amount, { from: admin, gas: 3000000});
            })
    }
});