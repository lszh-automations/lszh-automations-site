'use strict';
// Shared typographic wordmark. No icon, external asset or tracking request.
function wordmarkHtml({dark=true,size=24}={}){
 const main=dark?'#ffffff':'#173a60',accent=dark?'#74d8ff':'#356bde';
 return '<span class="lszh-wordmark" style="display:inline-block;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;line-height:1.1;letter-spacing:0;color:'+main+';"><span style="font-size:'+size+'px;font-weight:800;letter-spacing:0;">LSZH</span><span style="font-size:'+(size*11/24)+'px;font-weight:700;letter-spacing:.5px;margin-left:4px;color:'+accent+';">AUTOMATIONS</span></span>';
}
module.exports={wordmarkHtml};
