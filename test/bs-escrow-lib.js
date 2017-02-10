'use strict';

const BSTokenData = require('bs-token-data');
const BSTokenBanking = require('bs-token-banking');
const BSToken = require('bs-token');
const Escrow = require('../src/lib');
const GTPermissionManager = require('gt-permission-manager');
const Web3 = require('web3');
const Promise = require('bluebird');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const BigNumber = require('bignumber.js');

chai.use(chaiAsPromised);
chai.should();

const web3 = new Web3(require('./mock-web3-provider'));
Promise.promisifyAll(web3.eth);
Promise.promisifyAll(web3.personal);

describe('Escrow lib', () => {
    const gas = 3000000;
    const assetId1 = '1';
    const assetId2 = '2';
    const assetId3 = '3';
    const assetId4 = '4';
    const assetId5 = '5';

    const assetPrice = 400;
    let permissionManager;
    let bsTokenFrontend;
    let escrow;
    let bsTokenData;
    let bsTokenBanking;
    const admin = '0x5bd47e61fbbf9c8b70372b6f14b068fddbd834ac';
    const buyer = '0x25e940685e0999d4aa7bd629d739c6a04e625761';
    const seller = '0x6128333118cef876bd620da1efa464437470298d';

    before(function() {
        this.timeout(60000);

        return GTPermissionManager.deployContract(web3, admin, gas)
            .then((contract) => {
                permissionManager = contract;
                return BSTokenData.deployContract(web3, admin, permissionManager, gas);
            })
            .then(contract => {
                bsTokenData = contract;
                return BSTokenBanking.deployContract(web3, admin, bsTokenData, permissionManager, gas);
            })
            .then((contract) => {
                bsTokenBanking = contract;
                return BSToken.deployContract(web3, admin, admin, bsTokenData, permissionManager, gas);
            })
            .then((contract) => {
                bsTokenFrontend = contract;
                return Escrow.deployContract(web3, admin, bsTokenFrontend, admin, permissionManager, gas);
            })
            .then((contract) => {
                const bsTokenLib = new BSToken(web3, {
                    admin: { account: admin, password: '' },
                    contractBSToken: bsTokenFrontend
                });

                escrow = new Escrow(web3,  {
                    admin: { account: admin, password: '' },
                    bsTokenLib : bsTokenLib,
                    contractEscrow: contract
                });
            });
    });

    describe('Escrow lib', () => {
        it('add cash to buyer', () => {
            return bsTokenBanking.cashInAsync(buyer, assetPrice, { from: admin, gas: gas});
        });

        it('check balance buyer after', () => {
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
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
            return bsTokenBanking.cashInAsync(buyer, assetPrice, { from: admin, gas: gas});
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice * 2)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice * 2)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
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

        it('add cash to buyer', () => {
            return bsTokenBanking.cashInAsync(buyer, assetPrice, { from: admin, gas: gas});
        });

        it('create another escrow', () => {
            return escrow.createEscrow(buyer, '', seller, assetPrice, assetId5);
        }).timeout(10000);

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
            return bsTokenFrontend.balanceOfAsync(buyer)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice)));
        });

        it('check balance contract after', () => {
            return bsTokenFrontend.balanceOfAsync(escrow.contract.address)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(0)));
        });

        it('check balance seller after', () => {
            return bsTokenFrontend.balanceOfAsync(seller)
                .should.eventually.satisfy(balance => balance.equals(new BigNumber(assetPrice * 2)));
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