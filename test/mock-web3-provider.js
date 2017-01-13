'use strict';

const TestRPC = require("ethereumjs-testrpc");

const provider = TestRPC.provider({
    accounts: [
        {index: 0, balance: 20000000},
        {index: 1, balance: 20000000},
        {index: 2, balance: 20000000},
        {index: 3, balance: 20000000},
        {index: 4, balance: 20000000}
    ]
});

const sendAsyncOriginal = provider.sendAsync;
provider.sendAsync = function (payload, callback){
    console.log(payload);
    if (payload.method === 'personal_newAccount' || payload.method === 'personal_unlockAccount') {
        callback(null, {
            jsonrpc: '2.0',
            id: 1234,
            result: true
        });
    } else {
        sendAsyncOriginal(payload, callback)
    }
};

module.exports = provider;

