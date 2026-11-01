import {scrypt, randomBytes, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export async function hashPassword(value){
  if(!validPassword(value))throw new Error('Use a password of 12–128 characters.');
  const salt=randomBytes(16).toString('hex');
  const key=await derive(value,salt,64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(value,encoded){
  if(!validPassword(value)||typeof encoded!=='string'||!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded))return false;
  const [,salt,key]=encoded.split('$');
  return timingSafeEqual(await derive(value,salt,64),Buffer.from(key,'hex'));
}
