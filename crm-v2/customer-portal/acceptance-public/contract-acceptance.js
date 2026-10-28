'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  let token=location.hash.slice(1),pkg=null,busy=false,completed=false,challengeId=null;
  history.replaceState(null,'',location.pathname);
  const labels={offer:'Offerte',terms:'Projektbedingungen',avv:'AVV und zugehörige Anlagen'};
  const errors={LOGIN_CODE_INVALID:'Der Code ist ungültig oder abgelaufen. Bitte prüfen Sie den Code.',LOGIN_RATE_LIMITED:'Bitte warten Sie, bevor Sie einen neuen Code anfordern.',LOGIN_DELIVERY_FAILED:'Der Code konnte nicht versendet werden. Bitte wenden Sie sich an LSZH.',LINK_EXPIRED:'Dieser Link ist abgelaufen. Bitte wenden Sie sich an LSZH.',
    LINK_ALREADY_USED:'Die Rückmeldung zu diesem Paket wurde bereits gespeichert.',
    LINK_INVALID:'Der Annahmelink ist ungültig oder fehlt.',IDENTITY_REQUIRED:'Bitte melden Sie sich mit dem für dieses Paket vorgesehenen Konto an.',
    DOCUMENT_VERSION_CHANGED:'Die Dokumentversion hat sich geändert. Bitte verwenden Sie den aktuellen Link.',
    DOCUMENT_INTEGRITY_FAILED:'Die Dokumente konnten nicht sicher geprüft werden. Bitte wenden Sie sich an LSZH.',
    REPRESENTATIVE_NOT_VERIFIED:'Ihre Berechtigung konnte nicht bestätigt werden. Bitte wenden Sie sich an LSZH.',
    EXPLICIT_CONSENT_REQUIRED:'Bitte bestätigen Sie die erforderlichen Punkte einzeln.'};
  const date=value=>new Intl.DateTimeFormat('de-CH',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Zurich'}).format(new Date(value));
  function showError(code){$('error').textContent=errors[code]||'Die Rückmeldung konnte nicht sicher abgeschlossen werden. Bitte laden Sie die Seite erneut oder wenden Sie sich an LSZH.';$('error').hidden=false;}
  async function api(url,options={}){
    const response=await fetch(url,{...options,cache:'no-store',credentials:'same-origin',
      headers:{Authorization:'Bearer '+token,...options.headers}});
    if(!response.ok){let value;try{value=await response.json();}catch{}throw Error(value?.error||'REQUEST_FAILED');}
    return response;
  }
  function updateButton(){
    $('submit').disabled=busy||completed||!pkg||!$('terms').checked||!$('representative').checked||(pkg.avvRequired&&!$('avv').checked);
  }
  async function load(){
    try{
      if(!token&&location.hostname==='127.0.0.1'){
        const res=await fetch('/api/demo-session',{cache:'no-store'});
        if(res.ok)token=(await res.json()).token;
      }
      pkg=await (await api('/api/acceptance')).json();
      $('package-label').textContent='Offerte '+pkg.offerNumber+' · Dokumentversion '+pkg.revision;
      $('offer-number').textContent='Nr. '+pkg.offerNumber;
      $('recipient').textContent=pkg.recipient;$('expires').textContent=date(pkg.expiresAt);
      $('terms-text').textContent=pkg.declarations.terms;$('avv-text').textContent=pkg.declarations.avv;
      $('representative-text').textContent=pkg.declarations.representative;
      $('avv-row').hidden=!pkg.avvRequired;$('avv').required=pkg.avvRequired;
      $('make-requirements').hidden=!pkg.makeRequirements;
      if(pkg.makeRequirements){
        $('make-requirements-title').textContent=pkg.makeRequirements.title;
        $('make-requirements-text').replaceChildren();
        for(const paragraph of pkg.makeRequirements.paragraphs){const p=document.createElement('p');p.textContent=paragraph;$('make-requirements-text').append(p);}
      }
      $('documents').replaceChildren();
      for(const doc of pkg.documents){
        const row=document.createElement('div');row.className='document';
        const icon=document.createElement('span');icon.className='pdf';icon.textContent='PDF';
        const info=document.createElement('div'),title=document.createElement('h3'),meta=document.createElement('p');
        title.textContent=labels[doc.kind];meta.textContent=(pkg.testOnly?'Testdokument · ':'PDF · ')+Math.ceil(doc.bytes/1024)+' KB';info.append(title,meta);
        const download=document.createElement('button');download.type='button';download.textContent='PDF herunterladen';
        download.addEventListener('click',async()=>{
          download.disabled=true;
          try{const bytes=await (await api('/api/documents/'+doc.kind)).blob();
            const url=URL.createObjectURL(bytes),link=document.createElement('a');link.href=url;link.download=doc.filename;
            document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
          }catch(e){showError(e.message);}finally{download.disabled=false;}
        });row.append(icon,info,download);$('documents').append(row);
      }
      $('login').hidden=true;$('error').hidden=true;
      if(!pkg.testOnly){document.querySelector('.badge').textContent='KUNDENPORTAL';const notice=document.querySelector('.notice');if(notice)notice.hidden=true;$('submit').textContent='Annahme protokollieren →';$('success').querySelector('h2').textContent='Vertrag erfolgreich angenommen!';$('success').querySelector('.fine').textContent='Die schriftliche Auftragsbestätigung durch LSZH folgt gesondert.';}
      $('package').hidden=false;updateButton();
    }catch(e){if(e.message==='IDENTITY_REQUIRED'){$('login').hidden=false;}else showError(e.message);}finally{$('loading').hidden=true;}
  }
  for(const id of ['terms','avv','representative'])$(id).addEventListener('change',updateButton);
  $('accept-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!pkg||$('submit').disabled)return;
    busy=true;updateButton();$('error').hidden=true;
    const submitLabel=$('submit').textContent;
    $('submit').textContent='Wird gespeichert …';$('accept-form').setAttribute('aria-busy','true');
    $('acceptance-status').textContent='Ihre Annahme wird gespeichert …';
    try{
      const receipt=await (await api('/api/acceptance',{method:'POST',
        headers:{'Content-Type':'application/json','X-CSRF-Token':pkg.csrf},
        body:JSON.stringify({packageSha256:pkg.packageSha256,revision:pkg.revision,
          termsConsent:$('terms').checked,avvConsent:pkg.avvRequired&&$('avv').checked,
          representativeDeclaration:$('representative').checked})})).json();
      // Only the persisted server receipt may unlock the success presentation.
      if(receipt?.state!=='customer_response_recorded'||typeof receipt.responseId!=='string'||!receipt.responseId.trim()||
        typeof receipt.acceptedAt!=='string'||!Number.isFinite(Date.parse(receipt.acceptedAt)))throw Error('INVALID_RECEIPT');
      completed=true;
      $('response-id').textContent=receipt.responseId;$('accepted-at').textContent=date(receipt.acceptedAt);
      $('package').hidden=true;$('intro').hidden=true;$('success').hidden=false;token='';
      $('acceptance-status').textContent='Annahme erfolgreich gespeichert.';
      $('success-title').focus({preventScroll:true});
      window.scrollTo({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }catch(e){$('acceptance-status').textContent='';showError(e.message);}
    finally{busy=false;$('accept-form').setAttribute('aria-busy','false');$('submit').textContent=submitLabel;updateButton();}
  });
  $('request-code').addEventListener('click',async()=>{
    $('request-code').disabled=true;
    try{const result=await (await api('/api/login/request',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
      challengeId=result.challengeId;$('login-form').hidden=false;$('login-status').textContent='Code versendet. Bitte prüfen Sie Ihre E-Mail.';
    }catch(e){showError(e.message);}finally{setTimeout(()=>{$('request-code').disabled=false;},60000);}
  });
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('verify-code').disabled=true;
    try{await api('/api/login/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId,code:$('login-code').value})});
      $('login-code').value='';await load();
    }catch(e){showError(e.message);}finally{$('verify-code').disabled=false;}
  });
  load();
})();
