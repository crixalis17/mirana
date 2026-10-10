import {researchReady,schedulerMinIntervalHours} from '@/lib/store';
import {user,googleReady,emailReady} from '@/lib/auth';
import {canViewUsage} from '@/lib/admin/access';
export async function GET(request:Request){const identity=await user(request);return Response.json({user:identity,canViewUsage:canViewUsage(identity),googleReady:googleReady(),emailReady:emailReady(),researchReady:researchReady(),schedulerMinIntervalHours:schedulerMinIntervalHours()},{headers:{'Cache-Control':'no-store'}})}
