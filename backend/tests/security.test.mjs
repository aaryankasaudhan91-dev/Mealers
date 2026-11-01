import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,validPassword} from '../security.mjs';
test('salted password hashes verify only the correct password',async()=>{
 const p='correct-horse-mealers';const a=await hashPassword(p),b=await hashPassword(p);
 assert.notEqual(a,b);assert.equal(await verifyPassword(p,a),true);assert.equal(await verifyPassword('incorrect-password',a),false);
 assert.equal(await verifyPassword(p,'legacy-sha256'),false);
});
test('password bounds prevent optional and oversized credentials',()=>{
 assert.equal(validPassword('short'),false);assert.equal(validPassword('x'.repeat(129)),false);assert.equal(validPassword('x'.repeat(12)),true);
});
