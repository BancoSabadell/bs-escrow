'use strict';

const Deployer = require('smart-contract-deployer');
const fs = require('fs');
const BSToken = require('bs-token');
const Escrow = require('../src/lib');
const Web3 = require('web3');
const Promise = require('bluebird');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
chai.should();

const web3 = new Web3(require('./mock-web3-provider'));
Promise.promisifyAll(web3.eth);
Promise.promisifyAll(web3.personal);

describe('Escrow lib', () => {
    const assetId1 = '1';
    const assetId2 = '2';
    const assetId3 = '3';
    const assetId4 = '4';
    const assetId5 = '5';

    const assetPrice = 400;
    var token = null;
    var escrow = null;
    var admin = null;
    var buyer = null;
    var seller = null;

    describe('preconditions', () => {
        it('populate admin, seller and buyer accounts', () => {
            return web3.eth.getAccountsAsync()
                .then(accounts => {
                    admin = accounts[0];
                    buyer = accounts[1];
                    seller = accounts[2];
                });
        });

        it('deploy dependent contracts', () => {
            const sources = {
                'TokenRecipient.sol': fs.readFileSync('./contracts/TokenRecipient.sol', 'utf8'),
                'Ownable.sol': fs.readFileSync('./contracts/Ownable.sol', 'utf8'),
                'BSToken.sol': fs.readFileSync('./contracts/BSToken.sol', 'utf8')
            };

            const paramsConstructor = {'BSToken': [0, 'BSToken', 0, 'BS']};

            const deployer = new Deployer({
                web3: web3,
                address: admin,
                gas: 3000000
            });

            return deployer.deployContracts(sources, paramsConstructor, ['BSToken']).then(contracts => {
                token = new BSToken(web3, {
                    admin: {
                        account: admin,
                        password: ''
                    },
                    contractBSToken: {
                        abi: contracts.BSToken.abi,
                        address: contracts.BSToken.address
                    },
                    sendgrid: {
                        apiKey: ''
                    }
                });
            });
        }).timeout(20000);

        it('deploy contract Escrow', () => {
            const sources = {
                'TokenRecipient.sol': fs.readFileSync('./contracts/TokenRecipient.sol', 'utf8'),
                'Ownable.sol': fs.readFileSync('./contracts/Ownable.sol', 'utf8'),
                'BSToken.sol': fs.readFileSync('./contracts/BSToken.sol', 'utf8'),
                'Escrow.sol': fs.readFileSync('./contracts/Escrow.sol', 'utf8')
            }

            const paramsConstructor = {'Escrow': [token.contract.address]};

            const deployer = new Deployer({
                web3: web3,
                address: admin,
                gas: 3000000
            });

            return deployer.deployContracts(sources, paramsConstructor, ['Escrow']).then(contracts => {
                escrow = new Escrow(web3, token, {
                    admin: {
                        account: admin,
                        password: ''
                    },
                    contractEscrow: {
                        abi: contracts.Escrow.abi,
                        address: contracts.Escrow.address
                    },
                    sendgrid: {
                        apiKey: ''
                    }
                });
            });
        }).timeout(20000);
    });

    describe('createEscrow', () => {
        it('add cash to account2', () => {
            return token.cashIn(buyer, assetPrice);
        });

        it('should be rejected if seller and buyer are the same account', () => {
            return escrow.createEscrow(buyer, '', buyer, assetPrice, assetId1)
                .should.eventually.be.rejectedWith('Buyer and seller can not be the same account');
        });

        it('should be fulfilled', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId1);
        });

        it('should be rejected if the assetId already exists', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId1)
                .should.eventually.be.rejectedWith('There is already an escrow for this asset id');
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: 0});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: assetPrice});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId1)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 0});
        });
    });

    describe('cancelEscrowProposal finish without arbitration', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowProposal(buyer, '', assetId2)
                .should.eventually.be.rejectedWith('There is no escrow for this asset id');
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowProposal('', assetId1);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: 0});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: assetPrice});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: 0});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId1)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 3});
        });

        it('should be rejected if the state of the escrow is not held', () => {
            return escrow.cancelEscrowProposal('', assetId1)
                .should.eventually.be.rejectedWith('This escrow has been already cancelled or fulfilled');
        });
    });

    describe('validateCancelEscrowProposal finish without arbitration', () => {
        const validate = true;

        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.validateCancelEscrowProposal('', assetId2, validate)
                .should.eventually.be.rejectedWith('There is no escrow for this asset id');
        });

        it('should be fulfilled', () => {
            return escrow.validateCancelEscrowProposal('', assetId1, validate);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: assetPrice});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: 0});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: 0});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId1)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 1});
        });

        it('should be rejected if the state of the escrow is not BuyerProposeCancellation', () => {
            return escrow.validateCancelEscrowProposal('', assetId1, validate)
                .should.eventually.be.rejectedWith('This escrow has not a proposal cancellation');
        });
    });

    describe('cancelEscrowProposal finish with arbitration', () => {
        it('add cash to buyer', () => {
            return token.cashIn(buyer, assetPrice);
        });

        it('create another escrow', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId2);
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowProposal('', assetId2);
        });
    });

    describe('validateCancelEscrowProposal finish with arbitration', () => {
        const validate = false;

        it('should be fulfilled', () => {
            return escrow.validateCancelEscrowProposal('', assetId2, validate);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: assetPrice});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: assetPrice});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: 0});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId2)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 4});
        });

        it('should be rejected if the state of the escrow is not BuyerProposeCancellation', () => {
            return escrow.validateCancelEscrowProposal('', assetId2, validate)
                .should.eventually.be.rejectedWith('This escrow has not a proposal cancellation');
        });
    });

    describe('cancelEscrow owner with arbitration', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrowArbitrating('', '6rdtcdrc4a3')
                .should.eventually.be.rejectedWith('There is no escrow for this asset id');
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrowArbitrating('', assetId2);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: assetPrice * 2});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: 0});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: 0});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId2)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 1});
        });

        it('should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.cancelEscrowArbitrating('', assetId2)
                .should.eventually.be.rejectedWith('This escrow has not a proposal cancellation which has been rejected');
        });
    });

    describe('cancelEscrow seller', () => {
        it('should be rejected if there is no previous escrow for this assetId', () => {
            return escrow.cancelEscrow('', assetId3)
                .should.eventually.be.rejectedWith('There is no escrow for this asset id');
        });

        it('create another escrow', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId3);
        });

        it('should be fulfilled', () => {
            return escrow.cancelEscrow('', assetId3);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: assetPrice * 2});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: 0});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: 0});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId3)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 1});
        });

        it('should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.cancelEscrow('', assetId3)
                .should.eventually.be.rejectedWith('This escrow has been already cancelled or fulfilled');
        });
    });


    describe('fulfillEscrow buyer', () => {
        it('should be rejected if the there is no previous escrow for this assetId', () => {
            return escrow.fulfillEscrow('', assetId4)
                .should.eventually.be.rejectedWith('There is no escrow for this asset id');
        });

        it('create another escrow', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId4);
        });

        it('should be fulfilled', () => {
            return escrow.fulfillEscrow('', assetId4);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: assetPrice});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: 0});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: assetPrice});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId4)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 2});
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not held', () => {
            return escrow.fulfillEscrow('', assetId4)
                .should.eventually.be.rejectedWith('This escrow has been already cancelled or fulfilled');
        });
    });


    describe('fulfillEscrow owner with arbitration', () => {
        it('should be rejected if the there is no previous escrow for this assetId', () => {
            return escrow.fulfillEscrowArbitrating('', assetId5)
                .should.eventually.be.rejectedWith('There is no escrow for this asset id');
        });

        it('create another escrow', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId5);
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.fulfillEscrowArbitrating('', assetId5)
                .should.eventually.be.rejectedWith('This escrow has not a proposal cancellation which has been rejected');
        });

        it('buyer make a proposal of cancellation', () => {
            return escrow.cancelEscrowProposal('', assetId5);
        });

        it('seller disagree with this a proposal of cancellation', () => {
            return escrow.validateCancelEscrowProposal('', assetId5, false);
        });

        it('should be fulfilled', () => {
            return escrow.fulfillEscrowArbitrating('', assetId5);
        });

        it('check balance buyer after', () => {
            return escrow.accountBalance(buyer)
                .should.eventually.include({amount: 0});
        });

        it('check balance contract after', () => {
            return escrow.accountBalance(escrow.contract.address)
                .should.eventually.include({amount: 0});
        });

        it('check balance seller after', () => {
            return escrow.accountBalance(seller)
                .should.eventually.include({amount: assetPrice * 2});
        });

        it('check escrow state after', () => {
            return escrow.getEscrow(assetId5)
                .should.eventually.include({buyer: buyer, seller: seller, assetPrice: assetPrice, state: 2});
        });

        it('fulfillEscrow should be rejected if the state of the escrow is not SellerDisagreeProposalCancellation', () => {
            return escrow.fulfillEscrowArbitrating('', assetId5)
                .should.eventually.be.rejectedWith('This escrow has not a proposal cancellation which has been rejected');
        });
    });
});