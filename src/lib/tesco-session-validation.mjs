/** Validate the shared Tesco session format for both the browser helper and server. */
export function validateTescoSession(session){
 if(!session||typeof session!=='object'||typeof session.accessToken!=='string'||!session.accessToken||typeof session.customerUuid!=='string'||!session.customerUuid||!session.cookies||typeof session.cookies!=='object'||Array.isArray(session.cookies))throw Error('INVALID_SESSION');
 if(/[\r\n]/.test(session.accessToken+session.customerUuid)||Object.entries(session.cookies).some(([key,value])=>typeof value!=='string'||/[\r\n]/.test(key+value)))throw Error('INVALID_SESSION');
 if(!Number.isFinite(session.accessTokenExpiry)||session.accessTokenExpiry<Date.now()+30000)throw Error('EXPIRED');
 return session;
}

export function isSessionHandoffId(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)}
