import {Basketeer} from 'basketeer';
import {loadTescoSession} from './tesco-session';

export async function tescoClient(){return new Basketeer({session:await loadTescoSession()})}
