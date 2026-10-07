import {createHash,timingSafeEqual} from 'node:crypto';
export function authorizeMachine(request: Request): Response | null {
  const secret=process.env.AUTOMATION_SECRET;
  if(!secret||secret.length<32)return Response.json({error:'Machine access is not configured.'},{status:503});
  const supplied=request.headers.get('authorization')||'';
  const digest=(value:string)=>createHash('sha256').update(value).digest();
  if(!timingSafeEqual(digest(supplied),digest('Bearer '+secret)))return Response.json({error:'Unauthorized.'},{status:401});
  return null;
}
