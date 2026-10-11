import {user} from '@/lib/auth';
import {canViewUsage,privateUsageHeaders} from '@/lib/admin/access';
import {guard} from '@/lib/origin';
import {researchTestAllowance} from '@/lib/research-jobs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
async function allowance(request:Request,grant:boolean){
  const identity=await user(request);
  if(!identity)return Response.json({error:'Sign in to continue.'},{status:401,headers:privateUsageHeaders});
  if(!canViewUsage(identity))return Response.json({error:'Access denied.'},{status:403,headers:privateUsageHeaders});
  try{guard(request);}catch{return Response.json({error:'Cross-site requests are not allowed.'},{status:403,headers:privateUsageHeaders});}
  if(grant){
    try{
      if(!request.headers.get('content-type')?.includes('application/json'))throw new Error();
      const raw=await request.text();if(raw.length>100)throw new Error();
      const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error();
    }catch{return Response.json({error:'Send an empty JSON object.'},{status:400,headers:privateUsageHeaders});}
  }
  try{return Response.json(await researchTestAllowance(identity,grant),{headers:privateUsageHeaders});}
  catch{return Response.json({error:'Research allowance could not be refreshed.'},{status:503,headers:privateUsageHeaders});}
}
export const GET=(request:Request)=>allowance(request,false);
export const POST=(request:Request)=>allowance(request,true);
