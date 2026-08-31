import {db,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,query,where,orderBy,onSnapshot,runTransaction,serverTimestamp} from "./firebase.js";
import {normalizeId,todayISO,daysOverdue} from "./utils.js";

export async function all(col){const s=await getDocs(collection(db,col));return s.docs.map(d=>({id:d.id,...d.data()}))}
export async function getById(col,id){const s=await getDoc(doc(db,col,id));return s.exists()?{id:s.id,...s.data()}:null}
export async function save(col,id,data){await setDoc(doc(db,col,id),{...data,updatedAt:serverTimestamp()},{merge:true})}
export async function remove(col,id){await deleteDoc(doc(db,col,id))}
export function listen(col,cb){return onSnapshot(collection(db,col),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))))}
export async function nextId(kind,prefix){
  const ref=doc(db,"counters",kind);
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);const n=(snap.exists()?Number(snap.data().value||0):0)+1;
    tx.set(ref,{value:n,updatedAt:serverTimestamp()},{merge:true});
    return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4,"0")}`;
  });
}
export async function borrowBook({memberId,bookId,borrowDate,dueDate,userId}){
  const memberRef=doc(db,"members",memberId), bookRef=doc(db,"books",bookId), counterRef=doc(db,"counters","loans");
  return runTransaction(db,async tx=>{
    const [m,b,c]=await Promise.all([tx.get(memberRef),tx.get(bookRef),tx.get(counterRef)]);
    if(!m.exists())throw Error("Member not found.");
    if(!b.exists())throw Error("Book not found.");
    const member=m.data(),book=b.data(),count=(c.exists()?Number(c.data().value||0):0)+1;
    if(member.status!=="active")throw Error("Member is not active.");
    if(Number(member.booksInHand||0)>=Number(member.maxBooksAllowed||5))throw Error("Member has reached the borrowing limit.");
    if(Number(book.availableCopies||0)<=0)throw Error("No available copies for this book.");
    const loanId=`FTC-LOAN-${new Date().getFullYear()}-${String(count).padStart(4,"0")}`;
    tx.set(counterRef,{value:count,updatedAt:serverTimestamp()},{merge:true});
    tx.update(bookRef,{availableCopies:Number(book.availableCopies)-1,borrowedCopies:Number(book.borrowedCopies||0)+1,status:Number(book.availableCopies)-1>0?"available":"borrowed",updatedAt:serverTimestamp()});
    tx.update(memberRef,{booksInHand:Number(member.booksInHand||0)+1,updatedAt:serverTimestamp()});
    tx.set(doc(db,"loans",loanId),{loanId,memberId,bookId,borrowDate,dueDate,returnDate:null,status:"Borrowed",fineAmount:0,finePaid:false,createdBy:userId,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    return loanId;
  });
}
export async function returnBook({loanId,userId,finePerDay}){
  const loanRef=doc(db,"loans",loanId);
  return runTransaction(db,async tx=>{
    const l=await tx.get(loanRef);if(!l.exists())throw Error("Loan not found.");
    const loan=l.data();if(loan.status==="Returned")throw Error("This loan has already been returned.");
    const [m,b]=await Promise.all([tx.get(doc(db,"members",loan.memberId)),tx.get(doc(db,"books",loan.bookId))]);
    if(!m.exists()||!b.exists())throw Error("Related member or book record is missing.");
    const returned=todayISO(),over=daysOverdue(loan.dueDate,returned),fine=over*Number(finePerDay||50);
    const book=b.data(),member=m.data();
    tx.update(loanRef,{returnDate:returned,status:"Returned",fineAmount:fine,finePaid:fine===0,updatedAt:serverTimestamp(),returnedBy:userId});
    tx.update(doc(db,"books",loan.bookId),{availableCopies:Number(book.availableCopies||0)+1,borrowedCopies:Math.max(0,Number(book.borrowedCopies||0)-1),status:"available",updatedAt:serverTimestamp()});
    tx.update(doc(db,"members",loan.memberId),{booksInHand:Math.max(0,Number(member.booksInHand||0)-1),updatedAt:serverTimestamp()});
    if(fine>0){
      const fineId=`${loanId}-FINE`;
      tx.set(doc(db,"fines",fineId),{fineId,loanId,memberId:loan.memberId,bookId:loan.bookId,amount:fine,dateCharged:returned,datePaid:null,paymentStatus:"Unpaid",createdAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
    }
    return {fine,over};
  });
}
