'use client';
import {useEffect} from 'react';
export default function MicrosoftConnectPage(){
 useEffect(()=>{sessionStorage.removeItem('microsoft-connect-state');window.history.replaceState({},'',window.location.pathname)},[]);
 return <main className="shell"><section className="panel" style={{maxWidth:560,margin:'10vh auto',padding:24}}><h1>Microsoft connection retired</h1><p>Family Calendar sends invitations through Brevo. No Microsoft connection is needed. Manage invitations and shared calendar feeds in Settings.</p><a href="/">Return to Family Calendar</a></section></main>;
}
