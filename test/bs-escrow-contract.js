'use strict';

const Deployer = require('smart-contract-deployer');
const fs = require('fs');
const TestRPC = require('ethereumjs-testrpc');
const Web3 = require('web3');
const web3 = new Web3(TestRPC.provider());
const Promise = require('bluebird');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const assert = chai.assert;
chai.use(chaiAsPromised);
chai.should();

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
    var token = null;
    var escrow = null;
    var admin = null;
    var buyer = null;
    var seller = null;
    var someOne = null;

    describe('preconditions', () => {
        it('populate admin, seller and buyer accounts', () => {
            return web3.eth.getAccountsAsync()
                .then(accounts => {
                    admin = accounts[0];
                    buyer = accounts[1];
                    seller = accounts[2];
                    someOne = accounts[3];
                });
        });

        it('deploy dependent contracts', () => {

            const sources = {
                'TokenRecipient.sol': fs.readFileSync('./node_modules/bs-token/contracts/TokenRecipient.sol', 'utf8'),
                'Ownable.sol': fs.readFileSync('./node_modules/bs-token/contracts/Ownable.sol', 'utf8'),
                'BSToken.sol': fs.readFileSync('./node_modules/bs-token/contracts/BSToken.sol', 'utf8')
            }

            const paramsConstructor = {'BSToken': [0, 'BSToken', 0, 'BS']};

            const deployer = new Deployer({
                web3: web3,
                address: admin,
                gas: 3000000
            });

            return deployer.deployContracts(sources, paramsConstructor, ['BSToken']).then(contracts => {
                token = web3.eth.contract(contracts.BSToken.abi).at(contracts.BSToken.address);
                Promise.promisifyAll(token);
            });
        }).timeout(20000);

        it('deploy contract Escrow', () => {
            const sources = {
                'TokenRecipient.sol': fs.readFileSync('./node_modules/bs-token/contracts/TokenRecipient.sol', 'utf8'),
                'Ownable.sol': fs.readFileSync('./node_modules/bs-token/contracts/Ownable.sol', 'utf8'),
                'BSToken.sol': fs.readFileSync('./node_modules/bs-token/contracts/BSToken.sol', 'utf8'),
                'Escrow.sol': fs.readFileSync('./contracts/Escrow.sol', 'utf8')
            }

            const paramsConstructor = {'Escrow': [token.address]};

            const deployer = new Deployer({
                web3: web3,
                address: admin,
                gas: 3000000
            });

            return deployer.deployContracts(sources, paramsConstructor, ['Escrow']).then(contracts => {
                escrow = web3.eth.contract(contracts.Escrow.abi).at(contracts.Escrow.address);
                Promise.promisifyAll(escrow);
            });
        }).timeout(20000);
    });

    describe('create escrow calling tokens.approveAndCall', () => {
        it('should be rejected if there is not enough funds', () => {
            const promise = token.approveAndCallAsync(escrow.address, seller, assetId1, assetPrice, {
                from: buyer,
                gas: 3000000
            });

            return promise.should.eventually.be.rejected
        });

        it('add cash to buyer', () => {
            return token.cashInAsync(buyer, assetPrice, {
                from: admin,
                gas: 3000000
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

        it('activate stopInEmergency', () => {
            return token.emergencyStopAsync({
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

        it('deactivate stopInEmergency', () => {
            return token.releaseAsync({
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
            return token.cashInAsync(buyer, assetPrice, {
                from: admin,
                gas: 3000000
            });
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


        it('activate stopInEmergency', () => {
            return escrow.emergencyStopAsync({
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

        it('deactivate stopInEmergency', () => {
            return escrow.releaseAsync({
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

        it('activate stopInEmergency', () => {
            return escrow.emergencyStopAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.cancelEscrowArbitratingAsync(assetId2, {from: admin, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('deactivate stopInEmergency', () => {
            return escrow.releaseAsync({
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

        it('activate stopInEmergency', () => {
            return escrow.emergencyStopAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.cancelEscrowAsync(assetId3, {from: seller, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('deactivate stopInEmergency', () => {
            return escrow.releaseAsync({
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

        it('activate stopInEmergency', () => {
            return escrow.emergencyStopAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.fulfillEscrowAsync(assetId4, {from: buyer, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('deactivate stopInEmergency', () => {
            return escrow.releaseAsync({
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
            return token.cashInAsync(buyer, assetPrice, {
                from: admin,
                gas: 3000000
            });
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

        it('activate stopInEmergency', () => {
            return escrow.emergencyStopAsync({
                from: admin,
                gas: 3000000
            });
        });

        it('should be rejected if stopInEmergency', () => {
            const promise = escrow.fulfillEscrowArbitratingAsync(assetId5, {from: admin, gas: 3000000});
            return promise.should.eventually.be.rejected
        });

        it('deactivate stopInEmergency', () => {
            return escrow.releaseAsync({
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
});