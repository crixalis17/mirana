import {ShoppingBag} from 'lucide-react';
import Link from 'next/link';

export function SessionScreen({error,onRetry}:{error?:string;onRetry?:()=>void}={}){
  return <main className="login-page">
    <Link className="brand" href="/"><ShoppingBag size={22}/>Mirana</Link>
    <section className="login-card" aria-busy={!error}>
      <div className="eyebrow">YOUR BUYING WORKSPACE</div>
      <h1>{error?'Let’s try again.':'Opening Mirana…'}</h1>
      <p role={error?'alert':'status'}>{error||'Getting your workspace ready.'}</p>
      {error&&onRetry&&<button className="google-button" onClick={onRetry}>Try again</button>}
    </section>
  </main>;
}
