import {auth,db,onAuthStateChanged,signOut,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,query,where,orderBy,onSnapshot,serverTimestamp,createUserWithEmailAndPassword} from "./firebase.js";
import {login} from "./auth.js";
import {all,getById,save,remove,listen,nextId,borrowBook,returnBook} from "./db.js";
import { $, $$, toast, loading, openModal, closeModal, formData, normalizeId, addDays, todayISO, daysOverdue, money, fmtDate, escapeHTML, downloadCSV, initials } from "./utils.js";

const state={profile:null,user:null,page:"dashboard",unsubs:[],settings:{loanPeriod:14,finePerDay:50,maxBooks:5,membershipValidity:365}};
const page=$("#page"), title=$("#pageTitle");

$("#modalClose").onclick=closeModal; $("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
$("#mobileMenu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#logoutBtn").onclick=async()=>{await signOut(auth);location.reload()};
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#loginError").textContent="";try{await login($("#loginUsername").value,$("#loginPassword").value)}catch(err){$("#loginError").textContent=err.message||"Unable to sign in."}};
$("#nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(!b)return;state.page=b.dataset.page;renderPage()});

onAuthStateChanged(auth,async user=>{
  state.user=user;
  if(!user){$("#loginView").classList.remove("hidden");$("#dashboardView").classList.add("hidden");return}
  try{
    const p=await getDoc(doc(db,"users",user.uid));
    if(!p.exists()||p.data().status!=="active"){await signOut(auth);throw Error("Staff profile is inactive or missing.")}
    state.profile={id:p.id,...p.data()};
    $("#loginView").classList.add("hidden");$("#dashboardView").classList.remove("hidden");
    $("#staffName").textContent=state.profile.fullName||state.profile.username;
    $("#staffRole").textContent=state.profile.role;
    $("#avatar").textContent=initials(state.profile.fullName||state.profile.username);
    $$(".admin-only").forEach(x=>x.classList.toggle("hidden",state.profile.role!=="Administrator"));
    await loadSettings();renderPage();
  }catch(e){toast(e.message,true);await signOut(auth)}
});

async function loadSettings(){
  try{
    const s=await all("settings");for(const x of s){if(x.settingName)state.settings[x.settingName]=x.settingValue}
  }catch{}
}
function pageHeader(sub,buttons=""){return `<div class="page-head"><div><p class="eyebrow">FTC LIBRARY MANAGEMENT</p><h3>${title.textContent}</h3><p>${sub}</p></div><div class="actions">${buttons}</div></div>`}
function setActive(){ $$(".nav-item[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===state.page));title.textContent=({dashboard:"Dashboard",members:"Members",books:"Books",borrow:"Borrow Books",returns:"Return Books",fines:"Fines",reports:"Reports",users:"Staff / Users",settings:"Settings",data:"Data Management"})[state.page]||"Dashboard";$("#sidebar").classList.remove("open")}
async function renderPage(){setActive();try{await ({dashboard:renderDashboard,members:renderMembers,books:renderBooks,borrow:renderBorrow,returns:renderReturns,fines:renderFines,reports:renderReports,users:renderUsers,settings:renderSettings,data:renderData}[state.page]||renderDashboard)()}catch(e){page.innerHTML=`<div class="card"><h3>Unable to load this page</h3><p class="muted">${escapeHTML(e.message)}</p></div>`}}

async function renderDashboard(){
 const [m,b,l,f]=await Promise.all([all("members"),all("books"),all("loans"),all("fines")]);
 const activeLoans=l.filter(x=>x.status==="Borrowed"), overdue=activeLoans.filter(x=>daysOverdue(x.dueDate)>0);
 page.innerHTML=pageHeader("Live statistics from Firestore")+`<div class="cards">
 ${stat("Total Members",m.length,"Registered members")}
 ${stat("Total Books",b.reduce((n,x)=>n+Number(x.totalCopies||0),0),"Physical copies")}
 ${stat("Available Books",b.reduce((n,x)=>n+Number(x.availableCopies||0),0),"Copies available")}
 ${stat("Borrowed Books",activeLoans.length,"Active loans")}
 ${stat("Overdue Books",overdue.length,"Needs attention")}
 ${stat("Outstanding Fines",money(f.filter(x=>x.paymentStatus!=="Paid").reduce((n,x)=>n+Number(x.amount||0),0)),"Unpaid amount")}</div>
 <div class="grid-2"><div class="card table-card"><div class="table-head"><strong>Recent Loans</strong><button class="btn ghost" data-go="returns">Returns</button></div>${loanTable(activeLoans.slice(-8).reverse(),m,b)}</div>
 <div class="card table-card"><div class="table-head"><strong>Overdue Loans</strong><span class="badge overdue">${overdue.length}</span></div>${loanTable(overdue.slice(0,8),m,b,true)}</div></div>`;
 $$("[data-go]").forEach(x=>x.onclick=()=>{state.page=x.dataset.go;renderPage()});
}
function stat(a,b,c){return `<div class="card stat"><div class="label">${a}</div><div class="value">${b}</div><div class="sub">${c}</div></div>`}
function loanTable(rows,m,b,over=false){if(!rows.length)return `<div class="empty">No records.</div>`;const mm=Object.fromEntries(m.map(x=>[x.memberId,x.fullName])),bb=Object.fromEntries(b.map(x=>[x.bookId,x.title]));return `<div class="table-wrap"><table><thead><tr><th>Loan</th><th>Member</th><th>Book</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${escapeHTML(x.loanId)}</td><td>${escapeHTML(mm[x.memberId]||x.memberId)}</td><td>${escapeHTML(bb[x.bookId]||x.bookId)}</td><td>${fmtDate(x.dueDate)}</td><td><span class="badge ${over?"overdue":x.status.toLowerCase()}">${over?"Overdue":x.status}</span></td></tr>`).join("")}</tbody></table></div>`}

async function renderMembers(){
 const rows=await all("members");
 page.innerHTML=pageHeader("Register, search and manage library members.",`<button class="btn primary" id="addMember">+ Add Member</button>`)+`<div class="toolbar"><input id="memberSearch" placeholder="Search ID, name, phone or email"><select id="memberFilter"><option value="">All statuses</option><option>active</option><option>inactive</option></select></div><div class="card table-card"><div class="table-wrap"><table><thead><tr><th>Member ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Joined</th><th>Expires</th><th>Books</th><th>Status</th><th>Actions</th></tr></thead><tbody id="memberRows"></tbody></table></div></div>`;
 const draw=()=>{const q=($("#memberSearch").value||"").toLowerCase(),f=$("#memberFilter").value;const r=rows.filter(x=>(!f||x.status===f)&&JSON.stringify(x).toLowerCase().includes(q));$("#memberRows").innerHTML=r.map(x=>`<tr><td>${escapeHTML(x.memberId)}</td><td>${escapeHTML(x.fullName)}</td><td>${escapeHTML(x.phone)}</td><td>${escapeHTML(x.email)}</td><td>${fmtDate(x.dateJoined)}</td><td>${fmtDate(x.dateExpires)}</td><td>${x.booksInHand||0}</td><td><span class="badge ${x.status}">${x.status}</span></td><td><button class="btn ghost" data-edit="${x.memberId}">Edit</button> <button class="btn danger" data-del="${x.memberId}">Delete</button></td></tr>`).join("")||`<tr><td colspan="9"><div class="empty">No members found.</div></td></tr>`};draw();$("#memberSearch").oninput=draw;$("#memberFilter").onchange=draw;
 $("#addMember").onclick=()=>memberModal();$("#memberRows").onclick=async e=>{const ed=e.target.closest("[data-edit]"),de=e.target.closest("[data-del]");if(ed)memberModal(rows.find(x=>x.memberId===ed.dataset.edit));if(de){const x=rows.find(x=>x.memberId===de.dataset.del);if(Number(x.booksInHand)>0&&!confirm("This member has active books. An administrator override is required. Continue?"))return;if(Number(x.booksInHand)>0&&state.profile.role!=="Administrator"){toast("Only an administrator can override an active loan deletion.",true);return}if(confirm("Deactivate/delete this member record?")){await remove("members",x.memberId);toast("Member removed.");renderMembers()}}};
}
async function memberModal(x=null){
 const editing=!!x,id=x?.memberId||await nextId("members","FTC-M"),date=x?.dateJoined||todayISO(),expires=x?.dateExpires||addDays(date,Number(state.settings.membershipValidity||365));
 openModal(`<h3>${editing?"Edit":"Register"} Member</h3><form id="memberForm" class="form-grid">
 <label>Member ID<input name="memberId" value="${id}" readonly></label><label>Full Name<input name="fullName" required value="${escapeHTML(x?.fullName||"")}"></label>
 <label>Address<input name="address" value="${escapeHTML(x?.address||"")}"></label><label>Date of Birth<input type="date" name="dateOfBirth" value="${x?.dateOfBirth||""}"></label>
 <label>Sex<select name="sex"><option></option><option ${x?.sex==="Male"?"selected":""}>Male</option><option ${x?.sex==="Female"?"selected":""}>Female</option></select></label>
 <label>Phone Number<input name="phone" required pattern="[0-9+ ()-]{7,}" value="${escapeHTML(x?.phone||"")}"></label>
 <label>Email<input type="email" name="email" value="${escapeHTML(x?.email||"")}"></label><label>Date Joined<input type="date" name="dateJoined" required value="${date}"></label>
 <label>Membership Expiry<input type="date" name="dateExpires" required value="${expires}"></label>
 <label>Membership Status<select name="status"><option value="active" ${x?.status!=="inactive"?"selected":""}>active</option><option value="inactive" ${x?.status==="inactive"?"selected":""}>inactive</option></select></label>
 <div class="full modal-actions"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">Save Member</button></div></form>`);
 $("#cancel").onclick=closeModal;$("#memberForm").onsubmit=async e=>{e.preventDefault();const d=formData(e.target);d.booksInHand=Number(x?.booksInHand||0);d.maxBooksAllowed=Number(x?.maxBooksAllowed||state.settings.maxBooks||5);d.createdAt=x?.createdAt||serverTimestamp();d.updatedAt=serverTimestamp();loading(true);try{await setDoc(doc(db,"members",id),d,{merge:true});closeModal();toast(`Member ${id} saved.`);renderMembers()}catch(err){toast(err.message,true)}finally{loading(false)}};
}

async function renderBooks(){
 const rows=await all("books");
 page.innerHTML=pageHeader("Catalogue, inventory and copy tracking.",`<button class="btn primary" id="addBook">+ Add Book</button>`)+`<div class="toolbar"><input id="bookSearch" placeholder="Search ID, title, author, ISBN"><select id="bookFilter"><option value="">All categories</option>${["Shorthand","Typing","Office Management","Computer Studies","Business Studies","General"].map(x=>`<option>${x}</option>`).join("")}</select></div><div class="card table-card"><div class="table-wrap"><table><thead><tr><th>Book ID</th><th>Title</th><th>Author</th><th>Subject</th><th>Total</th><th>Available</th><th>Borrowed</th><th>Status</th><th>Actions</th></tr></thead><tbody id="bookRows"></tbody></table></div></div>`;
 const draw=()=>{const q=($("#bookSearch").value||"").toLowerCase(),f=$("#bookFilter").value;const r=rows.filter(x=>(!f||x.subject===f)&&JSON.stringify(x).toLowerCase().includes(q));$("#bookRows").innerHTML=r.map(x=>`<tr><td>${escapeHTML(x.bookId)}</td><td>${escapeHTML(x.title)}</td><td>${escapeHTML(x.author)}</td><td>${escapeHTML(x.subject)}</td><td>${x.totalCopies}</td><td>${x.availableCopies}</td><td>${x.borrowedCopies}</td><td><span class="badge ${x.status}">${x.status}</span></td><td><button class="btn ghost" data-edit="${x.bookId}">Edit</button> <button class="btn danger" data-del="${x.bookId}">Delete</button></td></tr>`).join("")||`<tr><td colspan="9"><div class="empty">No books found.</div></td></tr>`};draw();$("#bookSearch").oninput=draw;$("#bookFilter").onchange=draw;$("#addBook").onclick=()=>bookModal();$("#bookRows").onclick=async e=>{const ed=e.target.closest("[data-edit]"),de=e.target.closest("[data-del]");if(ed)bookModal(rows.find(x=>x.bookId===ed.dataset.edit));if(de&&confirm("Delete this book record?")){const x=rows.find(x=>x.bookId===de.dataset.del);if(Number(x.borrowedCopies)>0){toast("Cannot delete a book with active loans.",true);return}await remove("books",x.bookId);toast("Book deleted.");renderBooks()}}};

async function bookModal(x=null){
 const editing=!!x,id=x?.bookId||await nextId("books","FTC-B");
 openModal(`<h3>${editing?"Edit":"Add"} Book</h3><form id="bookForm" class="form-grid">
 <label>Book ID<input name="bookId" value="${id}" readonly></label><label>Book Title<input name="title" required value="${escapeHTML(x?.title||"")}"></label>
 <label>Author<input name="author" required value="${escapeHTML(x?.author||"")}"></label><label>Publisher<input name="publisher" value="${escapeHTML(x?.publisher||"")}"></label>
 <label>Year Published<input type="number" name="yearPublished" min="0" max="${new Date().getFullYear()}" value="${x?.yearPublished||""}"></label><label>ISBN<input name="isbn" value="${escapeHTML(x?.isbn||"")}"></label>
 <label>Subject/Category<select name="subject" required>${["Shorthand","Typing","Office Management","Computer Studies","Business Studies","General"].map(s=>`<option ${x?.subject===s?"selected":""}>${s}</option>`).join("")}</select></label>
 <label>Number of Copies<input type="number" min="1" name="totalCopies" required value="${x?.totalCopies||1}"></label>
 <div class="full notice">Available and borrowed copies are maintained automatically from loan transactions.</div>
 <div class="full modal-actions"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">Save Book</button></div></form>`);
 $("#cancel").onclick=closeModal;$("#bookForm").onsubmit=async e=>{e.preventDefault();const d=formData(e.target),total=Number(d.totalCopies);if(!total||total<1)return toast("Copies must be at least 1.",true);const old=Number(x?.totalCopies||0),borrowed=Number(x?.borrowedCopies||0);if(editing&&total<borrowed){toast("Total copies cannot be below the number currently borrowed.",true);return}d.totalCopies=total;d.borrowedCopies=borrowed;d.availableCopies=total-borrowed;d.status=d.availableCopies>0?"available":"borrowed";d.dateAdded=x?.dateAdded||todayISO();d.createdAt=x?.createdAt||serverTimestamp();d.updatedAt=serverTimestamp();loading(true);try{await setDoc(doc(db,"books",id),d,{merge:true});closeModal();toast(`Book ${id} saved.`);renderBooks()}catch(err){toast(err.message,true)}finally{loading(false)}};
}

async function renderBorrow(){
 page.innerHTML=pageHeader("Issue an available book to an active member.")+`<div class="grid-2"><div class="card"><h3>Borrow Transaction</h3><form id="borrowForm" class="stack"><label>Member ID<input id="borrowMember" name="memberId" required placeholder="FTC-M-2026-0001"></label><div id="memberPreview"></div><label>Book ID<input id="borrowBook" name="bookId" required placeholder="FTC-B-2026-0001"></label><div id="bookPreview"></div><div class="form-grid"><label>Borrow Date<input type="date" name="borrowDate" value="${todayISO()}" required></label><label>Due Date<input type="date" name="dueDate" value="${addDays(todayISO(),Number(state.settings.loanPeriod||14))}" required></label></div><button class="btn primary">Borrow Book</button></form></div><div class="card"><h3>Loan Rules</h3><div class="notice">Maximum books per member: <strong>${state.settings.maxBooks||5}</strong></div><div class="notice">Default loan period: <strong>${state.settings.loanPeriod||14} days</strong></div><div class="notice">All inventory changes are committed in a Firestore transaction.</div></div></div>`;
 async function previewMember(){const x=await getById("members",normalizeId($("#borrowMember").value));$("#memberPreview").innerHTML=x?`<div class="detail-grid"><div class="detail"><small>Name</small><strong>${escapeHTML(x.fullName)}</strong></div><div class="detail"><small>Status</small><strong>${x.status}</strong></div><div class="detail"><small>Books in hand</small><strong>${x.booksInHand||0} / ${x.maxBooksAllowed||state.settings.maxBooks}</strong></div></div>`:`<p class="form-error">Member not found.</p>`}
 async function previewBook(){const x=await getById("books",normalizeId($("#borrowBook").value));$("#bookPreview").innerHTML=x?`<div class="detail-grid"><div class="detail"><small>Title</small><strong>${escapeHTML(x.title)}</strong></div><div class="detail"><small>Author</small><strong>${escapeHTML(x.author)}</strong></div><div class="detail"><small>Available</small><strong>${x.availableCopies}</strong></div></div>`:`<p class="form-error">Book not found.</p>`}
 $("#borrowMember").onblur=previewMember;$("#borrowBook").onblur=previewBook;$("#borrowForm").onsubmit=async e=>{e.preventDefault();const d=formData(e.target);loading(true);try{const loanId=await borrowBook({...d,userId:state.user.uid});toast(`Borrowed successfully. Loan ID: ${loanId}`);e.target.reset();$("#borrowForm [name=borrowDate]").value=todayISO();$("#borrowForm [name=dueDate]").value=addDays(todayISO(),Number(state.settings.loanPeriod||14));$("#memberPreview").innerHTML=$("#bookPreview").innerHTML=""}catch(err){toast(err.message,true)}finally{loading(false)}};
}
async function renderReturns(){
 const loans=(await all("loans")).filter(x=>x.status==="Borrowed"),m=await all("members"),b=await all("books");const mm=Object.fromEntries(m.map(x=>[x.memberId,x])),bb=Object.fromEntries(b.map(x=>[x.bookId,x]));
 page.innerHTML=pageHeader("Process returns and automatically calculate overdue fines.")+`<div class="card"><div class="toolbar"><input id="returnSearch" placeholder="Search Loan ID, Member ID or Book ID"></div><div class="table-wrap"><table><thead><tr><th>Loan ID</th><th>Member</th><th>Book</th><th>Borrowed</th><th>Due</th><th>Overdue</th><th>Action</th></tr></thead><tbody id="returnRows">${loans.map(x=>`<tr><td>${x.loanId}</td><td>${escapeHTML(mm[x.memberId]?.fullName||x.memberId)}</td><td>${escapeHTML(bb[x.bookId]?.title||x.bookId)}</td><td>${fmtDate(x.borrowDate)}</td><td>${fmtDate(x.dueDate)}</td><td>${daysOverdue(x.dueDate)}</td><td><button class="btn primary" data-return="${x.loanId}">Return</button></td></tr>`).join("")||`<tr><td colspan="7"><div class="empty">No active loans.</div></td></tr>`}</tbody></table></div></div>`;
 $("#returnSearch").oninput=e=>{$$("#returnRows tr").forEach(r=>r.style.display=r.textContent.toLowerCase().includes(e.target.value.toLowerCase())?"":"none")};$("#returnRows").onclick=e=>{const b=e.target.closest("[data-return]");if(b)returnModal(b.dataset.return)};
}
async function returnModal(loanId){
 const loan=await getById("loans",loanId),m=await getById("members",loan.memberId),b=await getById("books",loan.bookId),over=daysOverdue(loan.dueDate),fine=over*Number(state.settings.finePerDay||50);
 openModal(`<h3>Return Book</h3><div class="detail-grid"><div class="detail"><small>Loan ID</small><strong>${loan.loanId}</strong></div><div class="detail"><small>Book</small><strong>${escapeHTML(b?.title)}</strong></div><div class="detail"><small>Borrower</small><strong>${escapeHTML(m?.fullName)}</strong></div><div class="detail"><small>Due Date</small><strong>${fmtDate(loan.dueDate)}</strong></div><div class="detail"><small>Current Date</small><strong>${fmtDate(todayISO())}</strong></div><div class="detail"><small>Days Overdue</small><strong>${over}</strong></div><div class="detail"><small>Fine</small><strong>${money(fine)}</strong></div><div class="detail"><small>Payment Status</small><strong>${fine?"Unpaid":"No fine"}</strong></div></div><div class="modal-actions"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="confirmReturn">Confirm Return</button></div>`);
 $("#cancel").onclick=closeModal;$("#confirmReturn").onclick=async()=>{loading(true);try{const r=await returnBook({loanId,userId:state.user.uid,finePerDay:Number(state.settings.finePerDay||50)});closeModal();toast(`Return completed${r.fine?`. Fine: ${money(r.fine)}`:"."}`);renderReturns()}catch(e){toast(e.message,true)}finally{loading(false)}}
}
async function renderFines(){
 const [f,m,b]=await Promise.all([all("fines"),all("members"),all("books")]),mm=Object.fromEntries(m.map(x=>[x.memberId,x])),bb=Object.fromEntries(b.map(x=>[x.bookId,x]));
 page.innerHTML=pageHeader("Track, search and settle library fines.")+`<div class="toolbar"><input id="fineSearch" placeholder="Search fine, loan, member"><select id="fineFilter"><option value="">All payment statuses</option><option>Unpaid</option><option>Paid</option></select></div><div class="card table-card"><div class="table-wrap"><table><thead><tr><th>Fine ID</th><th>Loan</th><th>Member</th><th>Book</th><th>Amount</th><th>Charged</th><th>Status</th><th>Paid</th><th>Action</th></tr></thead><tbody id="fineRows"></tbody></table></div></div>`;
 const draw=()=>{const q=$("#fineSearch").value.toLowerCase(),filter=$("#fineFilter").value,r=f.filter(x=>(!filter||x.paymentStatus===filter)&&JSON.stringify(x).toLowerCase().includes(q));$("#fineRows").innerHTML=r.map(x=>`<tr><td>${x.fineId}</td><td>${x.loanId}</td><td>${escapeHTML(mm[x.memberId]?.fullName||x.memberId)}</td><td>${escapeHTML(bb[x.bookId]?.title||x.bookId)}</td><td>${money(x.amount)}</td><td>${fmtDate(x.dateCharged)}</td><td><span class="badge ${x.paymentStatus.toLowerCase()}">${x.paymentStatus}</span></td><td>${fmtDate(x.datePaid)}</td><td>${x.paymentStatus!=="Paid"?`<button class="btn primary" data-pay="${x.fineId}">Mark Paid</button>`:"—"}</td></tr>`).join("")||`<tr><td colspan="9"><div class="empty">No fines found.</div></td></tr>`};draw();$("#fineSearch").oninput=draw;$("#fineFilter").onchange=draw;$("#fineRows").onclick=async e=>{const p=e.target.closest("[data-pay]");if(!p)return;if(confirm("Mark this fine as paid?")){await updateDoc(doc(db,"fines",p.dataset.pay),{paymentStatus:"Paid",datePaid:todayISO(),updatedAt:serverTimestamp(),paidBy:state.user.uid});toast("Fine marked as paid.");renderFines()}}}
async function renderReports(){
 page.innerHTML=pageHeader("Generate live reports from Firestore.")+`<div class="card"><div class="actions"><button class="btn primary" data-report="members">Members</button><button class="btn primary" data-report="books">Books</button><button class="btn primary" data-report="loans">Borrowed Books</button><button class="btn primary" data-report="overdue">Overdue</button><button class="btn primary" data-report="returned">Returned</button><button class="btn primary" data-report="fines">Fines</button></div></div><div id="reportOutput" class="card table-card" style="margin-top:18px"><div class="empty">Choose a report.</div></div>`;
 $$("[data-report]").forEach(x=>x.onclick=()=>generateReport(x.dataset.report));
}
async function generateReport(type){
 const [m,b,l,f]=await Promise.all([all("members"),all("books"),all("loans"),all("fines")]);let rows=[];
 if(type==="members")rows=m.map(x=>({Member_ID:x.memberId,Name:x.fullName,Phone:x.phone,Email:x.email,Status:x.status,Books_In_Hand:x.booksInHand||0}));
 if(type==="books")rows=b.map(x=>({Book_ID:x.bookId,Title:x.title,Author:x.author,Subject:x.subject,Total:x.totalCopies,Available:x.availableCopies,Borrowed:x.borrowedCopies}));
 if(type==="loans")rows=l.filter(x=>x.status==="Borrowed").map(x=>({Loan_ID:x.loanId,Member_ID:x.memberId,Book_ID:x.bookId,Borrow_Date:x.borrowDate,Due_Date:x.dueDate,Status:x.status}));
 if(type==="overdue")rows=l.filter(x=>x.status==="Borrowed"&&daysOverdue(x.dueDate)>0).map(x=>({Loan_ID:x.loanId,Member_ID:x.memberId,Book_ID:x.bookId,Due_Date:x.dueDate,Days_Overdue:daysOverdue(x.dueDate),Fine_Amount:money(daysOverdue(x.dueDate)*Number(state.settings.finePerDay||50)),Payment_Status:"Unpaid"}));
 if(type==="returned")rows=l.filter(x=>x.status==="Returned").map(x=>({Loan_ID:x.loanId,Member_ID:x.memberId,Book_ID:x.bookId,Borrow_Date:x.borrowDate,Return_Date:x.returnDate,Fine:money(x.fineAmount),Payment_Status:x.finePaid?"Paid":(x.fineAmount?"Unpaid":"No fine")}));
 if(type==="fines")rows=f.map(x=>({Fine_ID:x.fineId,Loan_ID:x.loanId,Member_ID:x.memberId,Book_ID:x.bookId,Amount:money(x.amount),Date_Charged:x.dateCharged,Payment_Status:x.paymentStatus,Date_Paid:x.datePaid||""}));
 const keys=rows.length?Object.keys(rows[0]):[];$("#reportOutput").innerHTML=`<div class="table-head"><strong>${type[0].toUpperCase()+type.slice(1)} Report</strong><div class="actions"><button class="btn ghost" id="printReport">Print</button><button class="btn gold" id="csvReport">Export CSV</button></div></div><div class="table-wrap"><table><thead><tr>${keys.map(k=>`<th>${escapeHTML(k)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${escapeHTML(r[k])}</td>`).join("")}</tr>`).join("")||`<tr><td colspan="${keys.length||1}"><div class="empty">No records.</div></td></tr>`}</tbody></table></div>`;$("#printReport").onclick=()=>print();$("#csvReport").onclick=()=>downloadCSV(`FTC-${type}-report.csv`,rows);
}

async function renderUsers(){
 if(state.profile.role!=="Administrator"){page.innerHTML=`<div class="card"><h3>Access restricted</h3><p class="muted">Administrator privileges are required.</p></div>`;return}
 const rows=await all("users");
 page.innerHTML=pageHeader("Manage staff profiles and roles.",`<button class="btn primary" id="addUser">+ Add Staff</button>`)+`<div class="card table-card"><div class="table-wrap"><table><thead><tr><th>Staff ID</th><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.staffId||x.id}</td><td>${escapeHTML(x.username)}</td><td>${escapeHTML(x.fullName)}</td><td>${escapeHTML(x.email||"")}</td><td>${x.role}</td><td><span class="badge ${x.status}">${x.status}</span></td><td><button class="btn ghost" data-user="${x.id}">Edit</button></td></tr>`).join("")}</tbody></table></div></div>`;
 $("#addUser").onclick=()=>userModal();$$("[data-user]").forEach(b=>b.onclick=()=>userModal(rows.find(x=>x.id===b.dataset.user)));
}
async function userModal(x=null){
 const editing=!!x;
 openModal(`<h3>${editing?"Edit":"Add"} Staff Account</h3><form id="userForm" class="form-grid">
 <label>Staff ID<input name="staffId" required value="${escapeHTML(x?.staffId||"")}" ${editing?"readonly":""}></label>
 <label>Username<input name="username" required value="${escapeHTML(x?.username||"")}" ${editing?"readonly":""}></label>
 <label>Full Name<input name="fullName" required value="${escapeHTML(x?.fullName||"")}"></label>
 <label>Email (profile)<input type="email" name="email" value="${escapeHTML(x?.email||"")}"></label>
 <label>Phone<input name="phone" value="${escapeHTML(x?.phone||"")}"></label>
 <label>Role<select name="role"><option ${x?.role==="Librarian"?"selected":""}>Librarian</option><option ${x?.role==="Administrator"?"selected":""}>Administrator</option></select></label>
 <label>Status<select name="status"><option>active</option><option ${x?.status==="inactive"?"selected":""}>inactive</option></select></label>
 ${editing?"":"<label>Password<input type=password name=password required minlength=8 placeholder=\"Minimum 8 characters\"></label>"}
 <div class="full notice">The username is converted to a private synthetic Firebase Auth email internally; staff still signs in with the username. Passwords are never stored in Firestore.</div>
 <div class="full modal-actions"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">Save Staff</button></div></form>`);
 $("#cancel").onclick=closeModal;$("#userForm").onsubmit=async e=>{e.preventDefault();const d=formData(e.target);loading(true);try{
   if(editing){await updateDoc(doc(db,"users",x.id),{staffId:d.staffId,fullName:d.fullName,email:d.email,phone:d.phone,role:d.role,status:d.status,updatedAt:serverTimestamp()});}
   else{
     const synthetic=`${normalizeId(d.username).toLowerCase()}@ftc-library.local`;const secondary=(await import("./firebase.js")).app; // same app cannot create without switching current user
     const cred=await createUserWithEmailAndPassword(auth,synthetic,d.password);await setDoc(doc(db,"users",cred.user.uid),{staffId:d.staffId,username:normalizeId(d.username),fullName:d.fullName,email:d.email,phone:d.phone,role:d.role,status:d.status,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
     toast("Staff account created. You are signed out because Firebase Auth switched to the new account.");await signOut(auth);return;
   }closeModal();toast("Staff profile updated.");renderUsers();
 }catch(err){toast(err.message,true)}finally{loading(false)}};
}
async function renderSettings(){
 if(state.profile.role!=="Administrator"){page.innerHTML=`<div class="card"><h3>Access restricted</h3></div>`;return}
 page.innerHTML=pageHeader("Configure operational library rules.")+`<div class="card"><form id="settingsForm" class="form-grid">
 <label>Library Name<input name="libraryName" value="${escapeHTML(state.settings.libraryName||"Federal Training Centre Polytechnic, Ikoyi, Lagos Library")}" required></label>
 <label>Loan Period (days)<input type=number name=loanPeriod min=1 value="${state.settings.loanPeriod||14}" required></label>
 <label>Fine Per Day (₦)<input type=number name=finePerDay min=0 value="${state.settings.finePerDay||50}" required></label>
 <label>Maximum Books Allowed<input type=number name=maxBooks min=1 value="${state.settings.maxBooks||5}" required></label>
 <label>Membership Validity (days)<input type=number name=membershipValidity min=1 value="${state.settings.membershipValidity||365}" required></label>
 <label>Library Contact<input name=contact value="${escapeHTML(state.settings.contact||"")}" placeholder="Phone / email"></label>
 <div class="full modal-actions"><button class="btn primary">Save Settings</button></div></form></div>`;
 $("#settingsForm").onsubmit=async e=>{e.preventDefault();const d=formData(e.target);loading(true);try{for(const [settingName,settingValue] of Object.entries(d)){await setDoc(doc(db,"settings",settingName),{settingName,settingValue:["loanPeriod","finePerDay","maxBooks","membershipValidity"].includes(settingName)?Number(settingValue):settingValue,updatedAt:serverTimestamp()},{merge:true});state.settings[settingName]=["loanPeriod","finePerDay","maxBooks","membershipValidity"].includes(settingName)?Number(settingValue):settingValue}toast("Settings saved to Firestore.")}catch(err){toast(err.message,true)}finally{loading(false)}};
}
async function renderData(){
 if(state.profile.role!=="Administrator"){page.innerHTML=`<div class="card"><h3>Access restricted</h3></div>`;return}
 page.innerHTML=pageHeader("Export live records. Export files are generated from Firestore data.")+`<div class="cards">${["members","books","loans","fines"].map(x=>`<div class="card"><h3>${x[0].toUpperCase()+x.slice(1)}</h3><p class="muted">Export all ${x} records.</p><button class="btn gold" data-export="${x}">Export CSV</button></div>`).join("")}</div><div class="notice">This module does not claim to create a cloud backup. It produces actual CSV downloads from the current Firestore records.</div>`;
 $$("[data-export]").forEach(b=>b.onclick=async()=>{try{const rows=await all(b.dataset.export);if(!rows.length)throw Error("No records available.");const cleaned=rows.map(x=>{const y={...x};delete y.id;return y});downloadCSV(`FTC-${b.dataset.export}-${todayISO()}.csv`,cleaned);toast("CSV export generated.")}catch(e){toast(e.message,true)}});
}
renderPage();
