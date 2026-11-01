import {Basketeer,type Session} from 'basketeer';
import {loadTescoSession} from './tesco-session';
export async function tescoClient(session?:Session){return new Basketeer({session:session??await loadTescoSession()})}
