import {convertLatexToMathMl} from 'mathlive/ssr';
import {DOMParser} from '@xmldom/xmldom';
export const PREFIX='MATHDOC1:';
export type MathNode={tag:string;text?:string;children?:MathNode[]};
export const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const textLatex=(s:string)=>'\\text{'+s.replace(/[\\{}%$&#_^~]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','%':'\\%','$':'\\$','&':'\\&','#':'\\#','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]||c))+'}';
export function decodeRich(value:string):string[]|null{if(!value?.startsWith(PREFIX))return null;try{const a=JSON.parse(value.slice(PREFIX.length));return Array.isArray(a)&&a.length<=60&&a.every(x=>typeof x==='string'&&x.length<=12000)?a:null}catch{return null}}
export function encodeRich(lines:string[]){return lines.some(x=>x.trim())?PREFIX+JSON.stringify(lines):''}
export function latexTree(latex:string):MathNode{
 const fragment=convertLatexToMathMl(latex.slice(0,12000));
 const doc=new DOMParser({onError:()=>{}}).parseFromString('<math>'+fragment+'</math>','text/xml');
 const read=(n:any):MathNode=>{if(n.nodeType===3)return {tag:'mtext',text:n.nodeValue||''};const tag=n.localName||n.nodeName;const children=Array.from(n.childNodes||[]).filter((c:any)=>c.nodeType===1||c.nodeType===3&&c.nodeValue.trim()).map(read);if(['mi','mn','mo','mtext','ms'].includes(tag))return {tag,text:n.textContent||''};if(['annotation','annotation-xml','script','style','a'].includes(tag))return {tag:'mrow',children:[]};return {tag,children}};
 return read(doc.documentElement);
}
export function treeMathml(n:MathNode):string{const allowed=['math','mrow','mi','mn','mo','mtext','ms','mfrac','msqrt','mroot','msup','msub','msubsup','mtable','mtr','mtd','mspace','mover','munder','munderover','menclose','semantics','mfenced'];const tag=allowed.includes(n.tag)?n.tag:'mrow';return '<'+tag+'>'+(n.text!==undefined?xml(n.text):(n.children||[]).map(treeMathml).join(''))+'</'+tag+'>'}
export function nodePlain(n:MathNode):string{if(n.text!==undefined)return n.text.replace(/[\u2061\u2062\u2063]/g,'');const c=(n.children||[]).map(nodePlain);if(n.tag==='mfrac')return '('+c[0]+')/('+c[1]+')';if(n.tag==='msup')return c[0]+'^('+c[1]+')';if(n.tag==='msub')return c[0]+'_'+c[1];if(n.tag==='msqrt')return '√('+c.join('')+')';if(n.tag==='mroot')return 'root('+c[0]+','+c[1]+')';return c.join('')}
export function richPlain(value:string):string{const lines=decodeRich(value);if(!lines)return value||'';try{return lines.map(l=>nodePlain(latexTree(l))).join('\n')}catch{return lines.join('\n')}}
export const sampleRich=encodeRich([textLatex('Денеге әсер ететін күштерді қолданып, үдеуді табыңыз.'),"x'=5\\,\\text{м}","x''=12\\,\\text{м/с}^{2}","a'=\\frac{F_{\\text{үйкеліс}}}{m}","v=\\sqrt{2gh+v^{2}}"]);
