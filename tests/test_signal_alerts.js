const assert=require('node:assert/strict');
const S=require('../app/src/main/assets/signal-alert.js');
S.reset();
assert.equal(S.observe('BTCUSDT|scalp','WAIT',1000).transition,false);
assert.equal(S.observe('BTCUSDT|scalp','LONG',2000).transition,true);
assert.equal(S.observe('BTCUSDT|scalp','LONG',3000).transition,false);
assert.equal(S.observe('BTCUSDT|scalp','WAIT',4000).transition,false);
assert.equal(S.observe('BTCUSDT|scalp','LONG',5000).transition,false); // cooldown
assert.equal(S.observe('BTCUSDT|scalp','WAIT',120001).transition,false);
assert.equal(S.observe('BTCUSDT|scalp','LONG',123000).transition,true);
assert.equal(S.observe('BTCUSDT|short','LONG',124000).transition,true); // distinct strategy
assert.equal(S.observe('BTCUSDT|short','SHORT',125000).transition,false); // not WAIT -> SHORT
assert.equal(S.observe('BTCUSDT|short','WAIT',126000).transition,false);
assert.equal(S.observe('BTCUSDT|short','SHORT',127000).transition,true);
console.log('Signal alerts: PASS');
