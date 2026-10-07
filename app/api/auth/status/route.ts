import {researchReady,schedulerMinIntervalHours} from '@/lib/store';
import {user,googleReady,emailReady} from '@/lib/auth';
export async function GET(request:Request){return Response.json({user:await user(request),googleReady:googleReady(),emailReady:emailReady(),researchReady:researchReady(),schedulerMinIntervalHours:schedulerMinIntervalHours()},{headers:{'Cache-Control':'no-store'}})}
