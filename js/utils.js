export const $ = (s,root=document)=>root.querySelector(s);
export const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
export const now = ()=>new Date();
export const todayISO = ()=>new Date().toISOString().slice(0,10);
export const addDays=(date,n)=>{const d=new Date(date+"T00:00:00");d.setDate(d.getDate()+Number(n));return d.toISOString().slice(0,10)};
export const daysOverdue=(due, returned=null)=>Math.max(0,Math.floor((new Date((returned||todayISO())+"T00:00:00")-new Date(due+"T00:00:00"))/86400000));
export const money=n=>"₦"+Number(n||0).toLocaleString("en-NG",{minimumFractionDigits:0});
export const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
export const fmtDate=v=>v?.toDate?v.toDate().toLocaleDateString("en-NG"):v?new Date(v+"T00:00:00").toLocaleDateString("en-NG"):"—";
export const slug=s=>String(s||"").trim().toLowerCase();
export const csvEscape=v=>`"${String(v??"").replaceAll('"','""')}"`;
export function downloadCSV(filename,rows){if(!rows.length){throw Error("There are no records to export.");}const keys=Object.keys(rows[0]);const csv=[keys.map(csvEscape).join(","),...rows.map(r=>keys.map(k=>csvEscape(r[k])).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
export function toast(msg,error=false){const t=$("#toast");t.textContent=msg;t.className="toast show"+(error?" error":"");setTimeout(()=>t.className="toast",3000)}
export function loading(on){$("#loading").classList.toggle("hidden",!on)}
export function openModal(html){$("#modalBody").innerHTML=html;$("#modal").classList.remove("hidden")}
export function closeModal(){$("#modal").classList.add("hidden");$("#modalBody").innerHTML=""}
export function formData(form){return Object.fromEntries(new FormData(form).entries())}
export function normalizeId(v){return String(v||"").trim().toUpperCase()}
export function initials(name){return String(name||"L").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
