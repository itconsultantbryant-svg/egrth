import { mkdir, writeFile } from 'node:fs/promises';
const directory='apps/web/public/images';
await mkdir(directory,{recursive:true});
// Original vector artwork. People are fictional illustrations, not portraits or endorsements.
function person(x,y,shirt='#17604a',skin='#633b2c',hair='short',scale=1,apron=false){return `<g transform="translate(${x} ${y}) scale(${scale})">
 <ellipse cx="0" cy="247" rx="61" ry="13" fill="#132f2920"/>
 <path d="M-29 135L-35 235Q-28 249-13 237L2 159L14 237Q30 246 35 234L28 135Z" fill="#203f3b"/>
 <path d="M-37 226L-13 226L-9 244L-43 244Q-49 237-37 226M14 226L35 226L47 240Q47 248 15 245Z" fill="#142f2c"/>
 <path d="M-24 51Q-52 56-57 87L-71 136Q-71 153-57 150L-35 103L-30 151L33 151L36 99L62 140Q73 149 80 136L56 82Q46 55 23 51Z" fill="${shirt}"/>
 <path d="M-70 132Q-80 150-69 158Q-58 162-55 145M62 134Q72 155 83 147Q88 140 77 129" fill="${skin}"/>
 <path d="M-11 35L-12 56Q1 70 15 54L12 34" fill="${skin}"/>
 <ellipse cx="1" cy="14" rx="27" ry="33" fill="${skin}"/>
 <ellipse cx="-25" cy="18" rx="5" ry="8" fill="${skin}"/><ellipse cx="27" cy="18" rx="5" ry="8" fill="${skin}"/>
 ${hair==='wrap'?'<path d="M-27 7Q-39-20-12-29Q25-43 32-10L28 8Q6-10-27 7" fill="#df9d4e"/><path d="M-21-21Q9-30 27-9M-26-10Q0-20 25-1" fill="none" stroke="#f4c981" stroke-width="4"/>':hair==='braids'?'<path d="M-27 16Q-39-36 2-28Q39-31 29 20L19-5Q0-22-20-4Z" fill="#252a26"/><path d="M-26 0L-32 55M-21-6L-25 63M23-6L30 59M28 1L36 49" stroke="#252a26" stroke-width="9" stroke-linecap="round"/>':'<path d="M-27 9Q-35-28 0-26Q35-31 29 8L20-6Q0-13-22-1Z" fill="#252a26"/>'}
 <path d="M-12 14h4M11 14h4" stroke="#29231f" stroke-width="3.5" stroke-linecap="round"/><path d="M-7 29Q2 35 11 28" fill="none" stroke="#f4c7a1" stroke-width="2.5" stroke-linecap="round"/>
 ${apron?'<path d="M-13 62L-25 83L-29 147H31L24 83L14 62L9 85H-8Z" fill="#dbe5cc"/><path d="M-12 106H16V127H-12Z" fill="#b8ceab"/>':''}
 </g>`;}
const plant=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 0H30L23 52H-23Z" fill="#ce8a58"/><path d="M0 0V-100M0-38Q-65-34-49-82Q-6-78 0-38M0-62Q56-61 49-111Q5-102 0-62" fill="#3e7f58" stroke="#316647" stroke-width="5"/></g>`;
const bin=(x,y,color='#227157')=>`<g transform="translate(${x} ${y})"><path d="M-44 0H44L36 126H-35Z" fill="${color}"/><rect x="-50" y="-10" width="100" height="18" rx="6" fill="#164c3d"/><path d="M-12-10V-24H15V-10" fill="none" stroke="#164c3d" stroke-width="7"/><circle cx="-25" cy="127" r="10" fill="#233b35"/><circle cx="26" cy="127" r="10" fill="#233b35"/><path d="M0 39Q-30 25-23 57Q-1 69 0 39Q24 20 27 44Q17 65 0 54V79" fill="#dbe8b5"/></g>`;
const defs=`<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#edf1df"/><stop offset="1" stop-color="#d8e8d9"/></linearGradient><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#f6ecda"/><stop offset="1" stop-color="#e4d6bc"/></linearGradient><pattern id="grain" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="4" cy="6" r="1" fill="#ffffff20"/><circle cx="24" cy="21" r="1" fill="#112e2110"/></pattern></defs>`;
function svg(title,scene){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720" role="img" aria-labelledby="title"><title id="title">${title} — original fictional illustration</title>${defs}<rect width="1000" height="720" fill="url(#sky)"/>${scene}<rect width="1000" height="720" fill="url(#grain)" pointer-events="none"/></svg>`;}
const scenes={
 kitchen:['Black African kitchen staff separating food scraps',`
 <rect x="60" y="68" width="880" height="547" rx="25" fill="url(#wall)"/><rect x="109" y="117" width="278" height="190" rx="8" fill="#86aa9c"/><path d="M248 117V307M109 216H387" stroke="#f4eddc" stroke-width="12"/><path d="M120 290Q200 201 255 241T380 222V300H120Z" fill="#4a8069"/>
 <rect x="536" y="143" width="325" height="15" rx="4" fill="#a77c51"/><rect x="559" y="97" width="43" height="46" rx="6" fill="#d6a36d"/><rect x="625" y="83" width="45" height="60" rx="7" fill="#6a8b61"/><path d="M705 142V96H750V142" fill="#e7b854"/>
 <path d="M0 585H1000V720H0Z" fill="#b8cab4"/><rect x="89" y="390" width="788" height="182" rx="13" fill="#b0c6b5"/><path d="M82 389H889V414H82Z" fill="#f8f0dc"/><path d="M145 426H339V553H145M363 426H558V553H363M581 426H820V553H581" fill="none" stroke="#7ea28e" stroke-width="4"/>
 ${person(335,292,'#f0c36d','#754832','wrap',1.12,true)}${person(663,301,'#1d6953','#4c2e26','short',1.08,true)}
 <ellipse cx="484" cy="406" rx="69" ry="15" fill="#6c8c6c"/><path d="M421 389Q435 447 489 442Q541 441 548 389Z" fill="#e4ad62"/><ellipse cx="486" cy="387" rx="63" ry="14" fill="#f7cf8b"/><path d="M458 382Q442 341 470 347Q499 355 477 383M498 385Q499 355 524 368Q528 389 498 385" fill="#5e8654"/>
 ${bin(800,475)}${plant(127,523,.65)}<path d="M40 660H959" stroke="#9aaf96" stroke-width="3"/>`],
 collection:['Black African collection crew and a green service vehicle',`
 <circle cx="813" cy="128" r="76" fill="#f0cd83"/><path d="M0 398Q176 239 330 366Q500 238 690 347Q843 246 1000 340V720H0Z" fill="#b6c9aa"/>
 <path d="M30 266H259V518H30Z" fill="#e9d4b3"/><path d="M14 269L145 186L279 269Z" fill="#a76c4b"/><rect x="72" y="330" width="64" height="89" fill="#6b927a"/><rect x="169" y="330" width="55" height="188" fill="#71907a"/><path d="M0 562H1000V720H0Z" fill="#c4bea6"/>
 <path d="M372 290H725V543H372Z" fill="#367f60"/><path d="M725 376H851L921 461V543H725Z" fill="#568e65"/><path d="M751 396H838L882 458H751Z" fill="#c4dfce"/><rect x="355" y="533" width="574" height="22" rx="6" fill="#234c3b"/>
 <circle cx="458" cy="550" r="46" fill="#283e35"/><circle cx="458" cy="550" r="24" fill="#adb6a0"/><circle cx="837" cy="550" r="46" fill="#283e35"/><circle cx="837" cy="550" r="24" fill="#adb6a0"/>
 <path d="M526 383Q476 350 485 411Q522 441 532 403Q583 357 591 400Q580 438 535 424V468" fill="#dce8b7"/>
 ${person(261,339,'#dfb754','#6b3e2b','short',1.13)}${bin(130,477)}${person(700,397,'#ebbc57','#563125','braids',.83)}
 <path d="M67 662H253M553 662H818" stroke="#eee9d9" stroke-width="10" stroke-linecap="round"/>${plant(961,493,.9)}`],
 receiving:['Black African facility staff independently weighing organics',`
 <path d="M75 211L497 65L925 211V574H75Z" fill="#d7d8bf"/><path d="M38 215L497 42L964 215" fill="none" stroke="#64836b" stroke-width="25"/>
 <rect x="148" y="256" width="700" height="304" fill="#abc1a4"/><path d="M151 256L350 560M849 256L651 560M501 218V560" stroke="#88a38b" stroke-width="11"/>
 <path d="M0 560H1000V720H0Z" fill="#c4ccb4"/>
 ${person(277,309,'#e9b45d','#5c3529','braids',1.17)}${person(707,326,'#315e50','#82543a','short',1.12)}
 <rect x="429" y="504" width="179" height="103" rx="8" fill="#e6e6d5"/><rect x="411" y="493" width="213" height="19" rx="5" fill="#6d8f7a"/><rect x="474" y="533" width="89" height="39" rx="5" fill="#304e41"/><path d="M491 555H546" stroke="#c8e4a2" stroke-width="5"/>
 <rect x="442" y="398" width="150" height="96" rx="8" fill="#bd9b69"/><path d="M464 400V490M568 400V490" stroke="#9b7c4c" stroke-width="5"/><path d="M464 396Q438 357 475 351Q500 356 499 390Q528 343 551 364Q568 393 539 398" fill="#709254"/>
 <path d="M745 413L796 424L772 507L720 493Z" fill="#f1ead6"/><path d="M741 436L777 446M737 451L769 461M733 465L759 474" stroke="#71947c" stroke-width="4"/>
 ${bin(120,489,'#a67d4a')}${plant(906,536,.8)}`],
 market:['Black African market traders and fresh local produce',`
 <path d="M50 179H943L907 269H90Z" fill="#267158"/><path d="M91 179H198L220 269H112ZM305 179H411L421 269H331ZM526 179H633L625 269H522ZM744 179H851L827 269H727Z" fill="#edc580"/>
 <path d="M103 258V589M892 258V589" stroke="#846f48" stroke-width="13"/><path d="M0 573H1000V720H0Z" fill="#c6cdb4"/>
 ${person(313,320,'#b56d43','#5d3426','wrap',1.05)}${person(687,321,'#3d7b62','#78492f','braids',1.05)}
 <rect x="143" y="472" width="708" height="129" rx="9" fill="#b69462"/><path d="M145 505H847M165 540H825M165 575H825" stroke="#987749" stroke-width="4"/>
 <ellipse cx="273" cy="478" rx="82" ry="18" fill="#6e8c5d"/><ellipse cx="503" cy="478" rx="81" ry="18" fill="#6e8c5d"/><ellipse cx="719" cy="478" rx="81" ry="18" fill="#6e8c5d"/>
 ${[220,249,279,309,338].map((x,i)=>`<circle cx="${x}" cy="${463-i%2*20}" r="22" fill="${i%2?'#d5a94f':'#c16842'}"/>`).join('')}
 ${[445,476,506,538,565].map((x,i)=>`<path d="M${x-12} 479Q${x-15} ${427-i%2*12} ${x+7} ${429-i%2*12}Q${x+30} 449 ${x+12} 479Z" fill="#7c9b52"/>`).join('')}
 ${[660,692,724,754,779].map((x,i)=>`<circle cx="${x}" cy="${459-i%2*20}" r="23" fill="#e0b750"/>`).join('')}${plant(63,534,.8)}`],
 team:['Black African colleagues discussing responsible collection operations',`
 <rect x="52" y="67" width="893" height="519" rx="28" fill="url(#wall)"/><rect x="603" y="121" width="273" height="217" rx="7" fill="#a6c4ae"/><path d="M741 121V338M603 230H876" stroke="#f0e6d2" stroke-width="10"/>
 <rect x="106" y="129" width="295" height="188" rx="10" fill="#f6efdd"/><path d="M135 276L195 238L244 258L304 193L369 175" stroke="#568665" stroke-width="9" fill="none"/>
 <path d="M0 581H1000V720H0Z" fill="#bac9b1"/>
 ${person(246,315,'#bc7f4d','#5b3428','short',1.11)}${person(506,303,'#267358','#805039','braids',1.12)}${person(759,327,'#e1b45a','#533126','wrap',1.07)}
 <path d="M150 481H861L886 513H133Z" fill="#ddb986"/><path d="M171 513V640M832 513V640" stroke="#a27d51" stroke-width="18"/><path d="M439 480L454 410H557L574 480Z" fill="#688d78"/><path d="M448 480H563" stroke="#3b604c" stroke-width="8"/>
 <path d="M626 474L687 462L716 486L655 494Z" fill="#f5efda"/>${plant(914,536,.8)}`]
};
for(const [name,[title,scene]] of Object.entries(scenes))await writeFile(`${directory}/${name}.svg`,svg(title,scene));
console.log('Generated five original African-led service illustrations. No real customer/team likenesses.');
