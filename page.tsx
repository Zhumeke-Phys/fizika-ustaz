import App from '../page';
import {getWebsiteUser} from '../site-auth';
import {isOfficial} from '../official';
export const dynamic='force-dynamic';
export const metadata={robots:{index:false,follow:false}};
export default async function AdminPage(){
 const user=await getWebsiteUser();
 if(!user)return <App initialTab="profile"/>;
 if(!isOfficial(user))return <main className="official-denied"><div className="panel"><h1>Кіруге рұқсат жоқ</h1><p>Бұл бөлім тек ресми әкімші аккаунтына арналған.</p><a className="primary" href="/">Басты бетке оралу</a></div></main>;
 return <App initialTab="admin"/>;
}
