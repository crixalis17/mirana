import {randomUUID} from 'node:crypto';
import {BasePlugin, InMemorySessionService, Runner, setLogger, type Event, type LlmAgent} from '@google/adk';

class PreserveResearchErrors extends BasePlugin {
  originalError:unknown;
  constructor(){super('mirana_research_errors');}
  override async onModelErrorCallback({error}:Parameters<BasePlugin['onModelErrorCallback']>[0]):Promise<undefined> {
    // ADK otherwise converts budget/lease/provider errors to UNKNOWN_ERROR
    // events. Keep the worker's original retry and checkpoint fencing decision.
    this.originalError=error;throw error;
  }
}

// ADK's default tracing can include full messages. Mirana emits its own safe
// stage/count/usage logs; framework payload/error logging stays disabled.
export function configureAdkPrivacy() {
  process.env.ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS='false';
  setLogger(null);
}

export async function* runIsolatedAdk(agent:LlmAgent,input:unknown,signal:AbortSignal,maxLlmCalls:number):AsyncGenerator<Event> {
  configureAdkPrivacy();signal.throwIfAborted();
  // A fresh service per invocation prevents cross-job/user memory. Durable
  // completed stages and source snapshots live in Mirana's fenced job store.
  const sessionService=new InMemorySessionService(),appName='mirana_research';
  const userId=randomUUID(),sessionId=randomUUID();
  await sessionService.createSession({appName,userId,sessionId});
  const errors=new PreserveResearchErrors();
  const runner=new Runner({appName,agent,sessionService,plugins:[errors]});
  try {
    for await (const event of runner.runAsync({userId,sessionId,abortSignal:signal,
      newMessage:{role:'user',parts:[{text:JSON.stringify(input)}]},runConfig:{maxLlmCalls}})) {
      signal.throwIfAborted();yield event;
    }
  } catch(error) {
    // PluginManager wraps callback exceptions. Unwrap only the exact error
    // recorded by our model-error plugin, never a provider-supplied payload.
    throw errors.originalError??error;
  } finally {await sessionService.deleteSession({appName,userId,sessionId});}
}
