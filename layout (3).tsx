import type {Metadata} from 'next';
import './globals.css';
const origin='https://fizika-ustaz.ortaq-top.chatgpt.site';
export const metadata:Metadata={metadataBase:new URL(origin),alternates:{canonical:origin},title:'Fizika Ustaz — Физика есептері және мұғалімдер қауымдастығы',description:'Физика мұғалімдеріне арналған есептер қоры. Физика пернетақтасы, бөлшек, түбір және формула редакторы. Word және PDF жинақтарын дайындау.',keywords:['fizika-ustaz','физика есептері','физика мұғалімі','физика пернетақтасы','physics problems'],robots:{index:true,follow:true},openGraph:{title:'Fizika Ustaz — Физика есептері',description:'Физика мұғалімдеріне арналған ортақ есептер қоры және формула редакторы.',url:origin,type:'website'},manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="kk"><body>{children}</body></html>}
