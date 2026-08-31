import {auth,db,signInWithEmailAndPassword,signOut,sendPasswordResetEmail,doc,getDoc} from "./firebase.js";
import {toast,loading,normalizeId} from "./utils.js";

const syntheticEmail = username => `${normalizeId(username).toLowerCase()}@ftc-library.local`;

export async function login(username,password){
  const u=normalizeId(username);
  loading(true);
  try{
    const cred=await signInWithEmailAndPassword(auth,syntheticEmail(u),password);
    const profile=await getDoc(doc(db,"users",cred.user.uid));
    if(!profile.exists() || profile.data().status!=="active"){
      await signOut(auth); throw Error("This staff account is not active or its profile is missing.");
    }
    return {user:cred.user,profile:profile.data()};
  }finally{loading(false)}
}
export async function logout(){await signOut(auth)}
export async function resetPassword(username){await sendPasswordResetEmail(auth,syntheticEmail(username))}
