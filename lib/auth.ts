import {createRemoteJWKSet,jwtVerify} from 'jose';
import {db} from './store';
export const config=()=>process.env as Record<string,string>;
export {appOrigin} from './origin';
export const googleReady=()=>!!(config().GOOGLE_CLIENT_ID&&config().GOOGLE_CLIENT_SECRET);
export const emailReady=()=>!!(config().RESEND_API_KEY&&config().EMAIL_FROM);
export const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
export function cookieHeader(request:Request,name:string,value:string,age:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.NODE_ENV==='production'||new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function user(request:Request){
  const token=cookie(request,'mirana_session');
  if(token){const row=await db().prepare('SELECT user FROM sessions WHERE id=? AND expires>?').bind(await hash(token),Date.now()).first() as any;if(row)return JSON.parse(row.user);}
  const host=new URL(request.url).hostname;
  if(process.env.NODE_ENV!=='production'&&!process.env.VERCEL&&config().AUTH_PREVIEW_MODE==='true'&&!googleReady()&&['localhost','127.0.0.1','[::1]'].includes(host))return {id:'local-demo',name:'Local preview',email:null,preview:true};
  return null;
}
export async function requireUser(request:Request){const u=await user(request);if(!u)throw new Error('Sign in with Google to continue.');return u;}
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogle(token:string,nonce:string){const {payload}=await jwtVerify(token,keys,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config().GOOGLE_CLIENT_ID});if(payload.nonce!==nonce||payload.email_verified!==true||!payload.sub||typeof payload.email!=='string')throw new Error('Google identity could not be verified.');return {id:payload.sub,name:typeof payload.name==='string'?payload.name:'Your account',email:payload.email,preview:false,provider:'google',emailVerified:true};}
