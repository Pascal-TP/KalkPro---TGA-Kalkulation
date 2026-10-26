/* Account-only password UI. No database, persistence, logging or registration. */
(function(root){'use strict';
const $=s=>document.querySelector(s),neutral='Falls für diese E-Mail-Adresse ein Benutzerkonto existiert, erhältst Du in Kürze eine E-Mail mit einem Link zum Zurücksetzen Deines Passworts. Bitte überprüfe gegebenenfalls auch Deinen Spam-Ordner.';
let auth,sdk,mode=null,pending=false,nextReset=0,cooldownTimer,opener;
const dialog=()=>$('#password-dialog'),form=()=>$('#password-form');
function validPassword(value){return Array.from(value).length>=8&&/\p{Lu}/u.test(value)&&/\p{Ll}/u.test(value)&&/[0-9]/.test(value)&&/[^\p{L}\p{N}\s]/u.test(value);}
function clearPasswords(){for(const x of dialog().querySelectorAll('input[type="password"]'))x.value='';}
function feedback(text,error=false){const x=$('#password-feedback');x.textContent=text;x.className=error?'warning':'info';x.setAttribute('role',error?'alert':'status');x.hidden=!text;}
function cooldown(){clearTimeout(cooldownTimer);const seconds=Math.max(0,Math.ceil((nextReset-Date.now())/1000));$('#password-cooldown').textContent=mode==='reset'&&seconds?'Ein erneuter Versand ist frühestens nach '+seconds+' Sekunden möglich.':'';$('#password-submit').disabled=pending||mode==='reset'&&seconds>0;if(mode==='reset'&&seconds)cooldownTimer=setTimeout(()=>{if(dialog().open&&mode==='reset')cooldown();},seconds*1000);}
function processing(on){pending=on;form().setAttribute('aria-busy',String(on));$('#password-fields').disabled=on;$('#password-progress').hidden=!on;$('#password-cancel').disabled=on;$('#password-close').disabled=on;cooldown();}
function close(){if(pending)return;clearPasswords();form().reset();dialog().close();}
function open(kind,trigger){if(pending||!auth||dialog().open)return;if(kind==='reset'&&auth.currentUser)return;if(kind==='change'&&!auth.currentUser)return;
 mode=kind;opener=trigger;form().reset();feedback('');$('#password-reset-fields').hidden=kind!=='reset';$('#password-change-fields').hidden=kind!=='change';for(const x of $('#password-reset-fields').querySelectorAll('input'))x.disabled=kind!=='reset';for(const x of $('#password-change-fields').querySelectorAll('input'))x.disabled=kind!=='change';$('#password-title').textContent=kind==='reset'?'Passwort zurücksetzen':'Passwort ändern';$('#password-submit').textContent=kind==='reset'?'Reset-Link anfordern':'Passwort ändern';$('#password-submit').hidden=false;$('#password-fields').hidden=false;$('#password-cancel').textContent='Abbrechen';$('#reset-email').value=$('#email').value.trim();processing(false);dialog().showModal();$(kind==='reset'?'#reset-email':'#current-password').focus();}
function errorMessage(error,kind){const code=error?.code;return ({'auth/too-many-requests':'Zu viele Versuche. Bitte warte einige Zeit und versuche es später erneut.','auth/network-request-failed':'Keine Verbindung zu Firebase. Bitte prüfe Deine Internetverbindung und versuche es erneut.','auth/invalid-email':'Bitte gib eine gültige E-Mail-Adresse ein.','auth/wrong-password':'Das aktuelle Passwort ist nicht korrekt. Bitte gib die Passwörter erneut ein.','auth/invalid-credential':kind==='change'?'Das aktuelle Passwort konnte nicht bestätigt werden. Bitte gib die Passwörter erneut ein.':'Die Anfrage konnte nicht verarbeitet werden. Bitte versuche es später erneut.','auth/requires-recent-login':'Firebase verlangt eine erneute Anmeldung. Bitte sichere ungespeicherte Änderungen, melde Dich erneut an und versuche es noch einmal.','auth/weak-password':'Das neue Passwort erfüllt die Firebase-Passwortregel nicht. Bitte beachte die angezeigten Anforderungen.','auth/password-does-not-meet-requirements':'Das neue Passwort erfüllt die im Firebase-Projekt festgelegten Anforderungen nicht.','auth/user-token-expired':'Die Anmeldung ist abgelaufen. Bitte sichere ungespeicherte Änderungen und melde Dich erneut an.','auth/user-mismatch':'Das angemeldete Konto hat sich geändert. Bitte öffne die Passwortänderung erneut.','auth/user-disabled':'Der Zugang ist deaktiviert. Bitte wende Dich an den Administrator.','auth/unauthorized-continue-uri':'Die Rückleitungsdomain ist in Firebase noch nicht freigegeben. Bitte informiere den Administrator.','auth/invalid-continue-uri':'Die Rückleitung zur Anmeldung ist noch nicht korrekt eingerichtet. Bitte informiere den Administrator.','auth/operation-not-allowed':'Die E-Mail-/Passwort-Anmeldung ist in Firebase nicht freigegeben. Bitte informiere den Administrator.'})[code]||'Die Anfrage konnte technisch nicht abgeschlossen werden. Bitte versuche es später erneut oder informiere den Administrator.';}
async function submit(event){event.preventDefault();if(pending||!mode)return;feedback('');
 if(mode==='reset'){
  if(auth.currentUser){close();return;}if(Date.now()<nextReset){cooldown();return;}
  const email=$('#reset-email');email.value=email.value.trim();if(!email.checkValidity()||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email.value)){feedback('Bitte gib eine gültige E-Mail-Adresse ein.',true);email.focus();return;}
  nextReset=Date.now()+60000;processing(true);let accepted=false;
  try{const url=new URL(root.location.pathname,root.location.origin);if(!['https:','http:'].includes(url.protocol))throw Error('unsupported-origin');auth.languageCode='de';await sdk.sendPasswordResetEmail(auth,email.value,{url:url.href,handleCodeInApp:false});accepted=true;}
  catch(error){if(['auth/user-not-found','auth/user-disabled','auth/invalid-credential'].includes(error?.code))accepted=true;else feedback(errorMessage(error,'reset'),true);}
  finally{processing(false);}
  if(accepted){form().reset();$('#password-fields').hidden=true;$('#password-submit').hidden=true;$('#password-cancel').textContent='Schließen';feedback(neutral);$('#password-cancel').focus();}
  return;
 }
 const user=auth.currentUser;if(!user?.email){clearPasswords();feedback('Bitte melde Dich erneut mit Deinem E-Mail-Konto an.',true);return;}
 const current=$('#current-password').value,newPassword=$('#new-password').value,repeat=$('#repeat-password').value;
 if(!current||!newPassword||!repeat){feedback('Bitte fülle alle drei Passwortfelder aus.',true);return;}
 if(!validPassword(newPassword)){feedback('Das neue Passwort benötigt mindestens 8 Zeichen sowie Groß- und Kleinbuchstaben, eine Ziffer und ein Sonderzeichen (kein Leerzeichen).',true);$('#new-password').focus();return;}
 if(newPassword!==repeat){feedback('Die neuen Passwörter stimmen nicht überein.',true);$('#repeat-password').focus();return;}
 if(newPassword===current){feedback('Das neue Passwort muss sich vom aktuellen Passwort unterscheiden.',true);$('#new-password').focus();return;}
 processing(true);
 try{await sdk.reauthenticateWithCredential(user,sdk.EmailAuthProvider.credential(user.email,current));if(auth.currentUser!==user)throw {code:'auth/user-mismatch'};await sdk.updatePassword(user,newPassword);clearPasswords();form().reset();$('#password-fields').hidden=true;$('#password-submit').hidden=true;$('#password-cancel').textContent='Schließen';feedback('Dein Passwort wurde erfolgreich geändert. Du kannst angemeldet bleiben.');}
 catch(error){feedback(errorMessage(error,'change'),true);}
 finally{clearPasswords();processing(false);if(!$('#password-submit').hidden)$('#current-password').focus();else $('#password-cancel').focus();}
}
function init(instance,api){auth=instance;sdk=api;}
function authChanged(user){if(dialog().open&&((mode==='change'&&!user)||(mode==='reset'&&user))){clearPasswords();form().reset();dialog().close();}}
document.addEventListener('click',event=>{const x=event.target.closest('[data-password-action]');if(!x||x.disabled)return;event.preventDefault();if(x.dataset.passwordAction==='close')close();else open(x.dataset.passwordAction,x);});
form().addEventListener('submit',submit);dialog().addEventListener('cancel',event=>{if(pending)event.preventDefault();else{clearPasswords();form().reset();}});dialog().addEventListener('close',()=>{clearPasswords();form().reset();clearTimeout(cooldownTimer);if(opener?.isConnected)opener.focus();});
root.KPPasswords={init,authChanged};
})(globalThis);
